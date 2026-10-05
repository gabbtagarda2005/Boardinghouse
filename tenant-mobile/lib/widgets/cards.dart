import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import 'common.dart';

/// A monthly bill with its total, balance, due date and status.
class BillCard extends StatelessWidget {
  const BillCard({super.key, required this.bill, required this.onTap});
  final Bill bill;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(bill.period, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.ink))),
              StatusBadge(bill.isVoid ? 'VOID' : bill.status),
            ]),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: _kv('Total', peso(bill.totalAmount))),
              Expanded(child: _kv('Still to pay', peso(bill.remainingBalance), strong: bill.remainingBalance > 0)),
              Expanded(child: _kv('Due date', formatDate(bill.dueDate))),
            ]),
          ]),
        ),
      ),
    );
  }

  static Widget _kv(String k, String v, {bool strong = false}) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(k, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
        const SizedBox(height: 2),
        Text(v, style: TextStyle(fontWeight: strong ? FontWeight.w800 : FontWeight.w600, fontSize: 15)),
      ]);
}

/// A payment in the history list.
class PaymentCard extends StatelessWidget {
  const PaymentCard({super.key, required this.payment, required this.onTap});
  final Payment payment;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = payment;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(peso(p.amount), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Text('${methodLabel(p.paymentMethod, p.provider)} · ${formatDate(p.paymentDate)}', style: const TextStyle(color: AppColors.muted)),
                if (p.receiptNumber != null) Text('Receipt ${p.receiptNumber}', style: const TextStyle(color: AppColors.muted, fontSize: 13)),
              ]),
            ),
            StatusBadge(p.status),
          ]),
        ),
      ),
    );
  }
}

/// The tenant's room at a glance (used on the home screen).
class RoomCard extends StatelessWidget {
  const RoomCard({super.key, required this.roomNumber, this.bedNumber, this.subtitle, this.onTap});
  final String? roomNumber;
  final int? bedNumber;
  final String? subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(14)),
              child: const Icon(Icons.bed, color: AppColors.primary, size: 28),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: roomNumber == null
                  ? const Text('No room assigned yet', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600))
                  : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Room $roomNumber', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.ink)),
                      if (bedNumber != null) Text('Bed $bedNumber', style: const TextStyle(fontSize: 15, color: AppColors.muted)),
                      if (subtitle != null) Text(subtitle!, style: const TextStyle(color: AppColors.muted)),
                    ]),
            ),
            if (onTap != null && roomNumber != null) const Icon(Icons.chevron_right, color: AppColors.muted),
          ]),
        ),
      ),
    );
  }
}

IconData notificationIcon(String type) {
  switch (type) {
    case 'bill_published':
      return Icons.receipt_long;
    case 'due_reminder':
      return Icons.event;
    case 'overdue':
      return Icons.warning_amber_rounded;
    case 'payment_confirmed':
      return Icons.check_circle_outline;
    case 'payment_rejected':
      return Icons.cancel_outlined;
    case 'announcement':
      return Icons.campaign_outlined;
    case 'room_assignment':
      return Icons.bed_outlined;
    default:
      return Icons.notifications_outlined;
  }
}

/// One notification in a list.
class NotificationCard extends StatelessWidget {
  const NotificationCard({super.key, required this.notification, required this.onTap, this.onDismiss});
  final AppNotification notification;
  final VoidCallback onTap;
  /// Shows a ✕ that removes this notification.
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    final n = notification;
    return Material(
      color: n.isRead ? AppColors.card : AppColors.navySoft,
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        leading: CircleAvatar(
          backgroundColor: AppColors.primary.withValues(alpha: n.isRead ? 0.06 : 0.14),
          child: Icon(notificationIcon(n.type), color: n.isRead ? AppColors.muted : AppColors.primary),
        ),
        title: Text(n.title, style: TextStyle(fontWeight: n.isRead ? FontWeight.w500 : FontWeight.w700)),
        subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const SizedBox(height: 2),
          Text(n.message, maxLines: 3, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 4),
          Text(timeAgo(n.createdAt), style: const TextStyle(fontSize: 12, color: AppColors.muted)),
        ]),
        onTap: onTap,
        trailing: onDismiss == null
            ? null
            : IconButton(
                tooltip: 'Remove notification',
                icon: const Icon(Icons.close, size: 20),
                color: AppColors.muted,
                onPressed: onDismiss,
              ),
      ),
    );
  }
}
