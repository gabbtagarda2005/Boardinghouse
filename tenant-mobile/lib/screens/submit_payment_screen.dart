import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../widgets/common.dart';

/// Tenant sends payment details (reference number + proof). It stays "Waiting for
/// verification" until the owner confirms it; the bill is NOT marked paid on submission.
class SubmitPaymentScreen extends StatefulWidget {
  const SubmitPaymentScreen({super.key, this.preselectBillId});
  final String? preselectBillId;
  @override
  State<SubmitPaymentScreen> createState() => _SubmitPaymentScreenState();
}

class _SubmitPaymentScreenState extends State<SubmitPaymentScreen> {
  static const _methods = ['GCASH', 'MAYA', 'BANK_TRANSFER', 'CASH', 'OTHER'];

  final _form = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _provider = TextEditingController();
  final _reference = TextEditingController();
  final _notes = TextEditingController();
  final _requestId = const Uuid().v4(); // idempotency key: double taps can't create duplicates
  PaymentInfo? _info;
  String? _loadError;
  String? _billId;
  String _method = 'GCASH';
  DateTime _date = DateTime.now();
  XFile? _proof;
  Uint8List? _proofBytes; // read once: used for preview and upload (works on mobile and web)
  bool _submitting = false;

  bool get _needsProvider => _method == 'BANK_TRANSFER' || _method == 'OTHER';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [_amount, _provider, _reference, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loadError = null);
    try {
      final info = PaymentInfo.fromJson(await context.read<ApiClient>().get('/me/payment-info'));
      final pre = info.unpaidBills.where((b) => b.id == widget.preselectBillId).firstOrNull ?? info.unpaidBills.firstOrNull;
      setState(() {
        _info = info;
        _billId = pre?.id;
        if (pre != null) _amount.text = pre.remainingBalance.toStringAsFixed(2);
        final first = info.channels.where((c) => c.paymentMethod != 'CASH' && _methods.contains(c.paymentMethod)).firstOrNull;
        if (first != null) {
          _method = first.paymentMethod;
          if (first.provider?.isNotEmpty == true) _provider.text = first.provider!;
        }
      });
    } catch (e) {
      setState(() => _loadError = ApiException.from(e).message);
    }
  }

  Future<void> _pickProof(ImageSource source) async {
    try {
      final f = await ImagePicker().pickImage(source: source, maxWidth: 2000, imageQuality: 85);
      if (f == null) return;
      final size = await f.length();
      if (size > 5 * 1024 * 1024) {
        if (mounted) showSnack(context, 'This photo is larger than 5 MB. Please choose a smaller one.', error: true);
        return;
      }
      final bytes = await f.readAsBytes();
      setState(() {
        _proof = f;
        _proofBytes = bytes;
      });
    } catch (e) {
      if (mounted) showSnack(context, 'Could not open the ${source == ImageSource.camera ? 'camera' : 'gallery'}.', error: true);
    }
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    if (_method != 'CASH' && _proof == null) {
      final proceed = await showConfirmationDialog(
        context,
        title: 'No receipt photo attached',
        message: 'A screenshot or photo of your receipt helps the owner confirm your payment faster. Send without it?',
        confirmLabel: 'Send anyway',
      );
      if (!proceed) return;
    }
    if (!mounted) return;
    final api = context.read<ApiClient>();
    setState(() => _submitting = true);
    try {
      final d = _date;
      final form = FormData.fromMap({
        if (_billId != null) 'billId': _billId,
        'amount': _amount.text.trim(),
        'paymentMethod': _method,
        if (_needsProvider && _provider.text.trim().isNotEmpty) 'provider': _provider.text.trim(),
        if (_reference.text.trim().isNotEmpty) 'referenceNumber': _reference.text.trim(),
        'paymentDate': '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}',
        if (_notes.text.trim().isNotEmpty) 'notes': _notes.text.trim(),
        'clientRequestId': _requestId,
        if (_proof != null && _proofBytes != null) 'proof': MultipartFile.fromBytes(_proofBytes!, filename: _proof!.name, contentType: DioMediaType.parse(_mimeFor(_proof!.name, _proof!.mimeType))),
      });
      await api.post('/me/payments', data: form);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          icon: const Icon(Icons.check_circle, color: AppColors.success, size: 44),
          title: const Text('Payment submitted successfully.'),
          content: const Column(mainAxisSize: MainAxisSize.min, children: [
            Text('Status', style: TextStyle(color: AppColors.muted)),
            SizedBox(height: 6),
            StatusBadge('PENDING_VERIFICATION', large: true),
            SizedBox(height: 12),
            Text('Your bill will show as paid once the owner verifies your payment.', textAlign: TextAlign.center),
          ]),
          actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK'))],
        ),
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) showSnack(context, ApiException.from(e).message, error: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _mimeFor(String name, String? reported) {
    if (reported != null && reported.startsWith('image/')) return reported;
    final n = name.toLowerCase();
    if (n.endsWith('.png')) return 'image/png';
    if (n.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  @override
  Widget build(BuildContext context) {
    final info = _info;
    return Scaffold(
      appBar: AppBar(title: const Text('I Have Paid')),
      body: info == null
          ? Center(child: _loadError != null ? ErrorView(message: _loadError!, onRetry: _load) : const CircularProgressIndicator())
          : info.unpaidBills.isEmpty
              ? const EmptyView(title: 'You have no unpaid bills', icon: Icons.verified_outlined)
              : SafeArea(
                  child: Form(
                    key: _form,
                    child: ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        DropdownButtonFormField<String>(
                          initialValue: _billId,
                          isExpanded: true,
                          decoration: const InputDecoration(labelText: 'Bill to pay'),
                          items: [
                            for (final b in info.unpaidBills) DropdownMenuItem(value: b.id, child: Text('${b.label} · ${peso(b.remainingBalance)}', overflow: TextOverflow.ellipsis)),
                          ],
                          onChanged: (v) => setState(() {
                            _billId = v;
                            final b = info.unpaidBills.firstWhere((x) => x.id == v);
                            _amount.text = b.remainingBalance.toStringAsFixed(2);
                          }),
                        ),
                        if (info.unpaidBills.length > 1)
                          Padding(
                            padding: const EdgeInsets.only(top: 6, left: 4),
                            child: Text('Total owed: ${peso(info.outstandingBalance)}. Any extra amount goes to your oldest unpaid bill.', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                          ),
                        const SizedBox(height: 16),
                        TextFormField(
                          controller: _amount,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d{0,2}'))],
                          decoration: const InputDecoration(labelText: 'Amount paid', prefixText: '₱ '),
                          validator: (v) {
                            final n = num.tryParse(v ?? '');
                            if (n == null || n <= 0) return 'Enter the amount you paid';
                            if (n > info.outstandingBalance + 0.001) return 'This is more than you owe (${peso(info.outstandingBalance)})';
                            return null;
                          },
                        ),
                        const SizedBox(height: 16),
                        const Text('How did you pay?', style: TextStyle(fontWeight: FontWeight.w600)),
                        const SizedBox(height: 8),
                        Wrap(spacing: 8, runSpacing: 8, children: [
                          for (final m in _methods)
                            ChoiceChip(
                              label: Text(methodLabels[m] ?? m),
                              selected: _method == m,
                              onSelected: (_) => setState(() => _method = m),
                            ),
                        ]),
                        const SizedBox(height: 16),
                        if (_needsProvider) ...[
                          TextFormField(controller: _provider, decoration: InputDecoration(labelText: _method == 'BANK_TRANSFER' ? 'Bank name' : 'Where did you pay?')),
                          const SizedBox(height: 16),
                        ],
                        TextFormField(
                          controller: _reference,
                          decoration: InputDecoration(labelText: _method == 'CASH' ? 'Receipt number (optional)' : 'Reference number'),
                          validator: (v) => _method != 'CASH' && (v == null || v.trim().isEmpty) ? 'Enter the reference number from your receipt' : null,
                        ),
                        const SizedBox(height: 16),
                        InkWell(
                          borderRadius: BorderRadius.circular(12),
                          onTap: () async {
                            final picked = await showDatePicker(context: context, initialDate: _date, firstDate: DateTime.now().subtract(const Duration(days: 365)), lastDate: DateTime.now());
                            if (picked != null) setState(() => _date = picked);
                          },
                          child: InputDecorator(
                            decoration: const InputDecoration(labelText: 'Payment date', suffixIcon: Icon(Icons.calendar_today_outlined)),
                            child: Text(formatLongDate(_date)),
                          ),
                        ),
                        const SizedBox(height: 20),
                        const Text('Photo of your receipt', style: TextStyle(fontWeight: FontWeight.w600)),
                        const SizedBox(height: 8),
                        if (_proof != null && _proofBytes != null)
                          Stack(children: [
                            ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.memory(_proofBytes!, height: 220, width: double.infinity, fit: BoxFit.cover)),
                            Positioned(
                              top: 8,
                              right: 8,
                              child: IconButton.filledTonal(
                                tooltip: 'Remove photo',
                                onPressed: () => setState(() {
                                  _proof = null;
                                  _proofBytes = null;
                                }),
                                icon: const Icon(Icons.close),
                              ),
                            ),
                          ])
                        else
                          Row(children: [
                            Expanded(child: OutlinedButton.icon(onPressed: () => _pickProof(ImageSource.gallery), icon: const Icon(Icons.photo_library_outlined), label: const Text('Gallery'))),
                            const SizedBox(width: 12),
                            Expanded(child: OutlinedButton.icon(onPressed: () => _pickProof(ImageSource.camera), icon: const Icon(Icons.photo_camera_outlined), label: const Text('Camera'))),
                          ]),
                        const SizedBox(height: 16),
                        TextFormField(controller: _notes, maxLines: 2, maxLength: 500, decoration: const InputDecoration(labelText: 'Note for the owner (optional)')),
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(color: const Color(0xFF221A07), borderRadius: BorderRadius.circular(16), border: Border.all(color: const Color(0xFF5C4410))),
                          child: const Text('Your payment will show as "Waiting for verification" until the owner confirms it. Your balance updates after that.', style: TextStyle(color: AppColors.warning)),
                        ),
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: _submitting ? null : _submit,
                          child: _submitting ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : const Text('Submit Payment'),
                        ),
                      ],
                    ),
                  ),
                ),
    );
  }
}
