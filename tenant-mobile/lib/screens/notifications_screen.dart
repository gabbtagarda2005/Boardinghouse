import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../providers/notification_provider.dart';
import '../widgets/cards.dart';
import '../widgets/common.dart';
import 'announcements_screen.dart';
import 'bill_detail_screen.dart';
import 'payment_detail_screen.dart';

/// Marks a notification read and opens the related bill / payment / announcement.
void openNotification(BuildContext context, AppNotification n, NotificationProvider provider) {
  provider.markRead(n);
  final nav = Navigator.of(context);
  final billId = n.data['billId'] as String?;
  final paymentId = n.data['paymentId'] as String?;
  if (paymentId != null) {
    nav.push(MaterialPageRoute(builder: (_) => PaymentDetailScreen(paymentId: paymentId)));
  } else if (billId != null) {
    nav.push(MaterialPageRoute(builder: (_) => BillDetailScreen(billId: billId)));
  } else if (n.type == 'announcement') {
    nav.push(MaterialPageRoute(builder: (_) => const AnnouncementsScreen()));
  } else {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(title: Text(n.title), content: Text(n.message), actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close'))]),
    );
  }
}

class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final p = context.watch<NotificationProvider>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [if (p.items.isNotEmpty) TextButton(onPressed: p.markAllRead, child: const Text('Mark all as read'))],
      ),
      body: RefreshIndicator(
        onRefresh: p.refresh,
        child: p.loading && p.items.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : p.error != null && p.items.isEmpty
                ? ListView(children: [ErrorView(message: p.error!, onRetry: p.refresh)])
                : p.items.isEmpty
                    ? ListView(children: const [EmptyView(title: 'No notifications', message: 'Bill, payment and announcement updates will appear here.', icon: Icons.notifications_none)])
                    : ListView.separated(
                        itemCount: p.items.length + (p.hasMore ? 1 : 0),
                        separatorBuilder: (_, _) => const Divider(height: 1),
                        itemBuilder: (context, i) {
                          if (i == p.items.length) {
                            return Padding(padding: const EdgeInsets.all(12), child: OutlinedButton(onPressed: p.loadMore, child: const Text('Load more')));
                          }
                          final n = p.items[i];
                          return NotificationCard(notification: n, onTap: () => openNotification(context, n, p), onDismiss: () => p.remove(n));
                        },
                      ),
      ),
    );
  }
}
