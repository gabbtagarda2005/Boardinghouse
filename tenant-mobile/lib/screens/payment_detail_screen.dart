import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/files.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class PaymentDetailScreen extends StatefulWidget {
  const PaymentDetailScreen({super.key, required this.paymentId});
  final String paymentId;
  @override
  State<PaymentDetailScreen> createState() => _PaymentDetailScreenState();
}

class _PaymentDetailScreenState extends State<PaymentDetailScreen> {
  bool _downloading = false;
  Future<Uint8List>? _proof;

  Future<void> _receipt(Payment p) async {
    setState(() => _downloading = true);
    try {
      final bytes = await context.read<ApiClient>().getBytes('/me/payments/${p.id}/receipt.pdf');
      await saveAndSharePdf(bytes, '${p.receiptNumber ?? 'receipt'}.pdf', text: 'Payment receipt ${p.receiptNumber ?? ''}');
    } catch (e) {
      if (mounted) showSnack(context, ApiException.from(e).message, error: true);
    } finally {
      if (mounted) setState(() => _downloading = false);
    }
  }

  ({String title, String body, Color color, IconData icon}) _banner(Payment p) {
    switch (p.status) {
      case 'CONFIRMED':
        return (title: 'Payment confirmed', body: 'The owner confirmed this payment on ${formatLongDate(p.verifiedAt)} and applied it to your bill.', color: AppColors.success, icon: Icons.check_circle);
      case 'REJECTED':
        return (title: 'Payment not accepted', body: p.rejectionReason ?? 'Please contact the owner.', color: AppColors.danger, icon: Icons.cancel);
      case 'REVERSED':
        return (title: 'Payment cancelled', body: p.rejectionReason ?? 'The owner cancelled this payment.', color: AppColors.danger, icon: Icons.undo);
      default:
        return (title: 'Waiting for verification', body: 'The owner will check your payment. Your bill is marked paid once it is confirmed.', color: AppColors.warning, icon: Icons.hourglass_top);
    }
  }

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();
    return Scaffold(
      appBar: AppBar(title: const Text('Payment')),
      body: AsyncLoader<Payment>(
        load: () async => Payment.fromJson(((await api.get('/me/payments/${widget.paymentId}'))['payment'] as Map).cast()),
        builder: (context, p, _) {
          final b = _banner(p);
          if (p.hasProof) _proof ??= api.getBytes('/me/payments/${p.id}/proof');
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              Text(peso(p.amount), style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800, color: AppColors.ink)),
              const SizedBox(height: 6),
              Align(alignment: Alignment.centerLeft, child: StatusBadge(p.status, large: true)),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: b.color.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(12), border: Border.all(color: b.color.withValues(alpha: 0.3))),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Icon(b.icon, color: b.color),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(b.title, style: TextStyle(fontWeight: FontWeight.w700, color: b.color)),
                      const SizedBox(height: 2),
                      Text(b.body),
                    ]),
                  ),
                ]),
              ),
              const SizedBox(height: 16),
              Card(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Column(children: [
                    AmountRow('Paid with', methodLabel(p.paymentMethod, p.provider)),
                    AmountRow('Reference number', p.referenceNumber ?? '—'),
                    AmountRow('Payment date', formatLongDate(p.paymentDate)),
                    if (p.submittedAt != null) AmountRow('Sent on', formatLongDate(p.submittedAt)),
                    if (p.receiptNumber != null) AmountRow('Receipt number', p.receiptNumber!),
                    AmountRow('Recorded by', p.source == 'ADMIN' ? 'Owner' : 'You'),
                  ]),
                ),
              ),
              if (p.allocations.isNotEmpty) ...[
                const SectionTitle('Applied to'),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: Column(children: [for (final a in p.allocations) AmountRow('${periodLabel(a.billingYear, a.billingMonth)} bill', peso(a.amount))]),
                  ),
                ),
              ],
              if (p.isConfirmed && p.receiptNumber != null) ...[
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: _downloading ? null : () => _receipt(p),
                  icon: _downloading ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.receipt_outlined),
                  label: const Text('View or Share Receipt'),
                ),
              ],
              if (p.hasProof) ...[
                const SectionTitle('Your proof of payment'),
                FutureBuilder<Uint8List>(
                  future: _proof,
                  builder: (context, snap) {
                    if (snap.connectionState != ConnectionState.done) return const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()));
                    if (snap.hasError || snap.data == null) return const Text('We couldn’t load your proof right now.', style: TextStyle(color: AppColors.muted));
                    return ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.memory(snap.data!, fit: BoxFit.contain, semanticLabel: 'Proof of payment', errorBuilder: (_, _, _) => const Text('Your proof was sent as a PDF file.')),
                    );
                  },
                ),
              ],
              if (p.notes?.isNotEmpty == true) ...[
                const SectionTitle('Notes'),
                Card(child: Padding(padding: const EdgeInsets.all(16), child: Text(p.notes!))),
              ],
            ],
          );
        },
      ),
    );
  }
}
