import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../providers/branding_provider.dart';
import '../widgets/cards.dart';
import '../widgets/common.dart';
import 'announcements_screen.dart';
import 'bill_detail_screen.dart';
import 'shell.dart';
import 'submit_payment_screen.dart';

class HomeData {
  HomeData(this.json)
      : currentBill = json['currentBill'] == null ? null : Bill.fromJson((json['currentBill'] as Map).cast()),
        notifications = ((json['notifications'] as List?) ?? []).map((e) => AppNotification.fromJson((e as Map).cast())).toList();
  final Map<String, dynamic> json;
  final Bill? currentBill;
  final List<AppNotification> notifications;
  Map<String, dynamic>? get room => (json['room'] as Map?)?.cast();
  Map<String, dynamic>? get nextDue => (json['nextDue'] as Map?)?.cast();
  num get outstanding => toNum(json['outstandingBalance']);
  int get pendingPayments => (json['pendingPayments'] as num?)?.toInt() ?? 0;
  String get name => (json['tenant'] as Map?)?['name'] as String? ?? '';
  String? get houseName => (json['house'] as Map?)?['name'] as String?;
  String? get logoUrl => (json['house'] as Map?)?['logoUrl'] as String?;
}

/// Home: who I am, my room, how much I owe, when it's due, and what's new.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();
    final branding = context.read<BrandingProvider>();
    return Scaffold(
      // The greeting below already shows the logo and house name; the bar keeps just the bell.
      appBar: AppBar(automaticallyImplyLeading: false, actions: const [NotificationBell()]),
      body: AsyncLoader<HomeData>(
        load: () async {
          final d = HomeData(await api.get('/me/home'));
          // Keep the logo/name used across the app up to date (the owner may have changed them).
          branding.update(name: d.houseName, logo: d.logoUrl);
          return d;
        },
        builder: (context, d, reload) {
          final first = d.name.split(' ').first;
          final room = d.room;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
            children: [
              _Header(first: first, houseName: d.houseName, logoUrl: d.logoUrl),
              const SizedBox(height: 18),
              _BalanceCard(data: d, onChanged: reload),
              if (d.pendingPayments > 0) ...[
                const SizedBox(height: 12),
                _PendingTile(count: d.pendingPayments),
              ],
              const SectionTitle('My room'),
              RoomCard(
                roomNumber: room?['roomNumber'] as String?,
                bedNumber: (room?['bedNumber'] as num?)?.toInt(),
                onTap: room == null ? null : () => AppShell.of(context)?.goTo(AppShellState.tabRoom),
              ),
              const SectionTitle('Quick actions'),
              const _QuickActions(),
            ],
          );
        },
      ),
    );
  }
}

/// Logo, boarding house name and a friendly greeting.
class _Header extends StatelessWidget {
  const _Header({required this.first, this.houseName, this.logoUrl});
  final String first;
  final String? houseName;
  final String? logoUrl;

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      HouseLogo(logoUrl: logoUrl, size: 54),
      const SizedBox(width: 14),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(houseName ?? 'Your boarding house', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.muted, fontSize: 14)),
          const SizedBox(height: 2),
          Text('${greeting()}, $first! 👋', style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: AppColors.ink, fontSize: 23)),
        ]),
      ),
    ]);
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.data, required this.onChanged});
  final HomeData data;
  final Future<void> Function() onChanged;

  @override
  Widget build(BuildContext context) {
    final bill = data.currentBill;
    final due = data.nextDue;
    final status = data.outstanding <= 0 ? 'PAID' : (due?['status'] as String? ?? bill?.status ?? 'UNPAID');
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF2F6BFF), Color(0xFF173A99), Color(0xFF0B1A45)]),
        boxShadow: const [BoxShadow(color: Color(0x4014224A), blurRadius: 24, spreadRadius: -8, offset: Offset(0, 12))],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(children: [
        Positioned(
          right: -40,
          top: -40,
          child: Container(width: 160, height: 160, decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.07))),
        ),
        Padding(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Expanded(child: Text('Current Balance', style: TextStyle(color: Colors.white70, fontSize: 15, fontWeight: FontWeight.w600))),
              StatusBadge(status),
            ]),
            const SizedBox(height: 6),
            Text(peso(data.outstanding), style: const TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
            const SizedBox(height: 12),
            if (due != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.event_outlined, color: Colors.white, size: 18),
                  const SizedBox(width: 8),
                  Flexible(child: Text('Due ${formatLongDate(parseDate(due['dueDate']))}', style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600))),
                ]),
              )
            else
              Text(bill == null ? 'No bill yet. You will be notified when your bill is ready.' : 'You have no unpaid bills. Thank you!', style: const TextStyle(color: Colors.white70, fontSize: 15)),
            const SizedBox(height: 18),
            Row(children: [
              if (bill != null || due != null)
                Expanded(
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white38)),
                    onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => BillDetailScreen(billId: (due?['billId'] as String?) ?? bill!.id))),
                    child: const Text('View Bill'),
                  ),
                ),
              if (data.outstanding > 0) ...[
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: AppColors.navy, minimumSize: const Size.fromHeight(48)),
                    onPressed: () async {
                      final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => SubmitPaymentScreen(preselectBillId: due?['billId'] as String?)));
                      if (ok == true) onChanged();
                    },
                    icon: const Icon(Icons.payments_outlined, size: 20),
                    label: const Text('Pay Now'),
                  ),
                ),
              ],
            ]),
          ]),
        ),
      ]),
    );
  }
}

class _PendingTile extends StatelessWidget {
  const _PendingTile({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFF221A07),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22), side: const BorderSide(color: Color(0xFF5C4410))),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () => AppShell.of(context)?.goTo(AppShellState.tabPayments),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: const Color(0xFF3A2A08), borderRadius: BorderRadius.circular(14)),
              child: const Icon(Icons.hourglass_top, color: Color(0xFFFCD34D)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('$count payment${count > 1 ? 's' : ''} waiting for verification', style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFFFDE68A))),
                const SizedBox(height: 2),
                const Text('Your balance updates when the owner confirms it.', style: TextStyle(color: Color(0xFFE7C77A), fontSize: 13)),
              ]),
            ),
            const Icon(Icons.chevron_right, color: Color(0xFFFCD34D)),
          ]),
        ),
      ),
    );
  }
}

/// Shortcuts to the things tenants do most.
class _QuickActions extends StatelessWidget {
  const _QuickActions();

  @override
  Widget build(BuildContext context) {
    final shell = AppShell.of(context);
    final items = <(IconData, String, VoidCallback)>[
      (Icons.receipt_long_outlined, 'My Bills', () => shell?.goTo(AppShellState.tabBills)),
      (Icons.history, 'Payments', () => shell?.goTo(AppShellState.tabPayments)),
      (Icons.campaign_outlined, 'News', () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AnnouncementsScreen()))),
      (Icons.person_outline, 'Profile', () => shell?.goTo(AppShellState.tabProfile)),
    ];
    return Row(children: [
      for (var i = 0; i < items.length; i++) ...[
        if (i > 0) const SizedBox(width: 10),
        Expanded(
          child: Material(
            color: AppColors.card,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22), side: const BorderSide(color: AppColors.border)),
            child: InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: items[i].$3,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 4),
                child: Column(children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
                    child: Icon(items[i].$1, color: Colors.white, size: 22),
                  ),
                  const SizedBox(height: 8),
                  Text(items[i].$2, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.ink)),
                ]),
              ),
            ),
          ),
        ),
      ],
    ]);
  }
}
