import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../widgets/cards.dart';
import '../widgets/common.dart';
import 'payment_detail_screen.dart';
import 'submit_payment_screen.dart';

/// Payments: how to pay, plus a history split into "waiting", "confirmed" and "not accepted".
class PaymentsScreen extends StatelessWidget {
  const PaymentsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const BrandTitle('Payments'),
          actions: const [NotificationBell()],
          bottom: const TabBar(tabs: [Tab(text: 'Pay'), Tab(text: 'Payment History')]),
        ),
        body: const TabBarView(children: [_PayTab(), _HistoryTab()]),
      ),
    );
  }
}

IconData _channelIcon(String method) => switch (method) {
      'CASH' => Icons.storefront_outlined,
      'BANK_TRANSFER' => Icons.account_balance_outlined,
      'GCASH' || 'MAYA' => Icons.phone_iphone,
      _ => Icons.payments_outlined,
    };

class _PayTab extends StatelessWidget {
  const _PayTab();

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();
    return AsyncLoader<PaymentInfo>(
      load: () async => PaymentInfo.fromJson(await api.get('/me/payment-info')),
      builder: (context, info, reload) => ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Amount to pay', style: TextStyle(color: AppColors.muted)),
                Text(peso(info.outstandingBalance), style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
                if (info.unpaidBills.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  for (final b in info.unpaidBills)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(children: [
                        Expanded(child: Text('${b.label} · due ${formatDate(b.dueDate)}', style: const TextStyle(fontSize: 14))),
                        Text(peso(b.remainingBalance), style: const TextStyle(fontWeight: FontWeight.w600)),
                        const SizedBox(width: 8),
                        StatusBadge(b.status),
                      ]),
                    ),
                ],
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: info.outstandingBalance <= 0
                      ? null
                      : () async {
                          final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const SubmitPaymentScreen()));
                          if (ok == true) reload();
                        },
                  icon: const Icon(Icons.upload_file),
                  label: Text(info.outstandingBalance <= 0 ? 'Nothing to pay' : 'I Have Paid'),
                ),
              ]),
            ),
          ),
          const SectionTitle('How to pay'),
          const _Steps(),
          if (info.channels.isNotEmpty) ...[
            const SectionTitle('Where to pay'),
            Card(
              clipBehavior: Clip.antiAlias,
              child: Column(children: [
                for (var i = 0; i < info.channels.length; i++) ...[
                  if (i > 0) const Divider(indent: 72),
                  _ChannelTile(channel: info.channels[i]),
                ],
              ]),
            ),
          ],
          if (info.instructions.isNotEmpty) ...[
            const SizedBox(height: 12),
            Card(
              clipBehavior: Clip.antiAlias,
              child: Theme(
                data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
                child: ExpansionTile(
                  leading: const Icon(Icons.sticky_note_2_outlined, color: AppColors.primary),
                  title: const Text('Note from the owner', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.ink)),
                  subtitle: const Text('Office hours and other details', style: TextStyle(color: AppColors.muted, fontSize: 13)),
                  childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  expandedAlignment: Alignment.centerLeft,
                  children: [Text(info.instructions, style: const TextStyle(fontSize: 15, height: 1.45))],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Three short steps instead of a long paragraph.
class _Steps extends StatelessWidget {
  const _Steps();

  @override
  Widget build(BuildContext context) {
    const steps = [
      (Icons.account_balance_wallet_outlined, 'Send the money', 'Use one of the accounts below, or pay cash at the office.'),
      (Icons.touch_app_outlined, 'Tap "I Have Paid"', 'It\'s the button at the top of this page.'),
      (Icons.receipt_long_outlined, 'Add your proof', 'Enter the reference number and a photo of the receipt. The owner then confirms it.'),
    ];
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Column(children: [
          for (var i = 0; i < steps.length; i++)
            Padding(
              padding: EdgeInsets.only(top: i == 0 ? 0 : 12),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(
                  width: 32,
                  height: 32,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
                  child: Text('${i + 1}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(steps[i].$2, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink)),
                    const SizedBox(height: 2),
                    Text(steps[i].$3, style: const TextStyle(fontSize: 13.5, color: AppColors.muted, height: 1.35)),
                  ]),
                ),
                const SizedBox(width: 8),
                Icon(steps[i].$1, color: AppColors.primary.withValues(alpha: 0.55), size: 22),
              ]),
            ),
        ]),
      ),
    );
  }
}

/// One payment account: method, account name, number (with Copy) and any short note.
class _ChannelTile extends StatelessWidget {
  const _ChannelTile({required this.channel});
  final PaymentChannel channel;

  @override
  Widget build(BuildContext context) {
    final c = channel;
    final number = c.accountNumber?.isNotEmpty == true ? c.accountNumber! : null;
    final note = c.instructions?.isNotEmpty == true ? c.instructions! : null;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(color: AppColors.navySoft, borderRadius: BorderRadius.circular(12)),
          child: Icon(_channelIcon(c.paymentMethod), color: AppColors.primary),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(methodLabel(c.paymentMethod, c.provider), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.ink)),
            if (c.accountName?.isNotEmpty == true) Text(c.accountName!, style: const TextStyle(color: AppColors.muted)),
            if (number != null) Text(number, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, letterSpacing: 0.3)),
            if (note != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(note, style: const TextStyle(color: AppColors.muted, fontSize: 13))),
          ]),
        ),
        if (number != null)
          TextButton.icon(
            onPressed: () {
              Clipboard.setData(ClipboardData(text: number));
              showSnack(context, 'Account number copied');
            },
            icon: const Icon(Icons.copy, size: 18),
            label: const Text('Copy'),
          ),
      ]),
    );
  }
}

class _HistoryTab extends StatelessWidget {
  const _HistoryTab();

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();
    return AsyncLoader<List<Payment>>(
      load: () async => (((await api.get('/me/payments', query: {'limit': 100}))['items'] as List?) ?? []).map((e) => Payment.fromJson((e as Map).cast())).toList(),
      builder: (context, payments, reload) {
        if (payments.isEmpty) {
          return ListView(children: const [EmptyView(title: 'No payments yet', message: 'Payments you send will appear here.', icon: Icons.payments_outlined)]);
        }
        final waiting = payments.where((p) => p.isPending).toList();
        final confirmed = payments.where((p) => p.isConfirmed).toList();
        final other = payments.where((p) => !p.isPending && !p.isConfirmed).toList();
        Widget section(String title, String help, List<Payment> list) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              SectionTitle(title),
              Padding(padding: const EdgeInsets.fromLTRB(4, 0, 4, 8), child: Text(help, style: const TextStyle(color: AppColors.muted, fontSize: 13))),
              for (final p in list) ...[
                PaymentCard(
                  payment: p,
                  onTap: () async {
                    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => PaymentDetailScreen(paymentId: p.id)));
                    reload();
                  },
                ),
                const SizedBox(height: 8),
              ],
            ]);
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
          children: [
            if (waiting.isNotEmpty) section('Waiting for verification', 'The owner is checking these payments.', waiting),
            if (confirmed.isNotEmpty) section('Confirmed', 'Applied to your bills. Tap one to get your receipt.', confirmed),
            if (other.isNotEmpty) section('Not accepted', 'These payments were not applied. Tap one to see why.', other),
          ],
        );
      },
    );
  }
}
