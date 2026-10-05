import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/files.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../widgets/cards.dart';
import '../widgets/common.dart';
import 'payment_detail_screen.dart';
import 'submit_payment_screen.dart';

const _sharing = {
  'EQUAL': 'shared equally',
  'PRORATED': 'shared by days you stayed',
  'CUSTOM': 'amount set by the owner',
  'INDIVIDUAL_METER': 'from your own meter',
};

/// One month's bill, laid out so the total is clear at a glance.
class BillDetailScreen extends StatefulWidget {
  const BillDetailScreen({super.key, required this.billId});
  final String billId;
  @override
  State<BillDetailScreen> createState() => _BillDetailScreenState();
}

class _BillDetailScreenState extends State<BillDetailScreen> {
  bool _downloading = false;

  Future<void> _download(Bill bill) async {
    setState(() => _downloading = true);
    try {
      final bytes = await context.read<ApiClient>().getBytes('/me/bills/${bill.id}/statement.pdf');
      await saveAndSharePdf(bytes, '${bill.billNumber}.pdf', text: 'Bill for ${bill.period}');
    } catch (e) {
      if (mounted) showSnack(context, ApiException.from(e).message, error: true);
    } finally {
      if (mounted) setState(() => _downloading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();
    return Scaffold(
      appBar: AppBar(title: const Text('Bill')),
      body: AsyncLoader<Map<String, dynamic>>(
        load: () => api.get('/me/bills/${widget.billId}'),
        builder: (context, d, reload) {
          final b = Bill.fromJson((d['bill'] as Map).cast());
          final payments = ((d['payments'] as List?) ?? []).map((e) => Payment.fromJson((e as Map).cast())).toList();
          final elecNote = b.electricityConsumption != null && (b.electricityRate ?? 0) > 0
              ? 'Room used ${b.electricityConsumption} kWh × ${peso(b.electricityRate)} = ${peso(b.electricityRoomTotal)}, ${_sharing[b.electricitySharing] ?? ''}'
              : null;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              Row(children: [
                Expanded(child: Text(b.period, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800, color: AppColors.ink))),
                StatusBadge(b.isVoid ? 'VOID' : b.status, large: true),
              ]),
              Text('Room ${b.roomNumber ?? '—'}${b.bedNumber != null ? ', Bed ${b.bedNumber}' : ''}', style: const TextStyle(color: AppColors.muted, fontSize: 15)),
              if (b.isVoid) Padding(padding: const EdgeInsets.only(top: 12), child: Text('This bill was cancelled. ${b.voidReason ?? ''}', style: const TextStyle(color: AppColors.danger))),
              const SizedBox(height: 16),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(children: [
                    AmountRow('Monthly Rent', peso(b.rent)),
                    AmountRow('Electricity', peso(b.electricity), sub: elecNote),
                    AmountRow('Water', peso(b.water)),
                    AmountRow('Other Charges', peso(b.otherTotal), sub: b.otherCharges.isEmpty ? null : b.otherCharges.map((c) => c.label).join(', ')),
                    for (final a in b.adjustments) AmountRow(a.amount < 0 ? 'Discount: ${a.label}' : a.label, peso(a.amount), color: a.amount < 0 ? AppColors.success : null),
                    const Divider(height: 24, thickness: 2),
                    AmountRow('TOTAL', peso(b.totalAmount), bold: true),
                    AmountRow('Amount Paid', peso(b.amountPaid), color: AppColors.success),
                    AmountRow('Remaining Balance', peso(b.remainingBalance), bold: true),
                    const Divider(height: 24),
                    AmountRow('Due Date', formatLongDate(b.dueDate)),
                    if (b.previousBalance > 0) AmountRow('Unpaid from earlier bills', peso(b.previousBalance), color: AppColors.warning),
                  ]),
                ),
              ),
              if (b.notes?.isNotEmpty == true) ...[
                const SizedBox(height: 12),
                Card(child: ListTile(leading: const Icon(Icons.sticky_note_2_outlined), title: const Text('Note from the owner'), subtitle: Text(b.notes!))),
              ],
              const SizedBox(height: 16),
              if (!b.isVoid && b.remainingBalance > 0)
                FilledButton.icon(
                  onPressed: () async {
                    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => SubmitPaymentScreen(preselectBillId: b.id)));
                    if (ok == true) reload();
                  },
                  icon: const Icon(Icons.payments_outlined),
                  label: const Text('Pay This Bill'),
                ),
              if (!b.isVoid) ...[
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: _downloading ? null : () => _download(b),
                  icon: _downloading ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.download_outlined),
                  label: const Text('Download or Share Bill'),
                ),
              ],
              const SectionTitle('Payments for this bill'),
              if (payments.isEmpty)
                const Card(child: EmptyView(title: 'No payments yet', icon: Icons.payments_outlined))
              else
                for (final p in payments) ...[
                  PaymentCard(payment: p, onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PaymentDetailScreen(paymentId: p.id)))),
                  const SizedBox(height: 8),
                ],
            ],
          );
        },
      ),
    );
  }
}
