import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/config.dart';
import '../core/theme.dart';
import '../providers/branding_provider.dart';
import '../providers/notification_provider.dart';
import '../screens/notifications_screen.dart';

/// Status shown with a colored icon AND a text label (never color alone).
/// The boarding house logo the owner uploaded in the admin portal (or a house icon if none).
/// Without [logoUrl] it shows the app-wide logo (BrandingProvider).
class HouseLogo extends StatelessWidget {
  const HouseLogo({super.key, this.logoUrl, this.size = 64});
  final String? logoUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    final logoUrl = this.logoUrl ?? context.watch<BrandingProvider?>()?.logoUrl;
    final fallback = Container(
      color: AppColors.primary,
      alignment: Alignment.center,
      child: Icon(Icons.home_work_rounded, color: Colors.white, size: size * 0.53),
    );
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(size * 0.28),
        boxShadow: const [BoxShadow(color: Color(0x1A14224A), blurRadius: 12, offset: Offset(0, 4))],
      ),
      clipBehavior: Clip.antiAlias,
      child: logoUrl == null || logoUrl.isEmpty
          ? fallback
          : Image.network(
              AppConfig.fileUrl(logoUrl),
              fit: BoxFit.contain,
              semanticLabel: 'Boarding house logo',
              errorBuilder: (_, _, _) => fallback,
            ),
    );
  }
}

/// Top-bar title with the boarding house logo, used on the main tabs.
class BrandTitle extends StatelessWidget {
  const BrandTitle(this.title, {super.key});
  final String title;

  @override
  Widget build(BuildContext context) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      const HouseLogo(size: 34),
      const SizedBox(width: 12),
      Flexible(child: Text(title, overflow: TextOverflow.ellipsis)),
    ]);
  }
}

class StatusBadge extends StatelessWidget {
  const StatusBadge(this.status, {super.key, this.large = false});
  final String status;
  final bool large;

  static const _map = <String, (String, Color, Color, IconData)>{
    'PAID': ('Paid', Color(0xFF6EE7B7), Color(0xFF0A3D31), Icons.check_circle),
    'CONFIRMED': ('Confirmed', Color(0xFF6EE7B7), Color(0xFF0A3D31), Icons.check_circle),
    'PENDING_VERIFICATION': ('Waiting for verification', Color(0xFFFCD34D), Color(0xFF3A2A08), Icons.hourglass_top),
    'UNPAID': ('Unpaid', Color(0xFFFCA5A5), Color(0xFF4A141C), Icons.error_outline),
    'PARTIALLY_PAID': ('Partially paid', Color(0xFF9DBBFF), Color(0xFF16295C), Icons.timelapse),
    'OVERDUE': ('Overdue', Color(0xFFFDBA74), Color(0xFF48230B), Icons.warning_amber_rounded),
    'REJECTED': ('Rejected', Color(0xFFAFBCDA), Color(0xFF1E2B4D), Icons.cancel_outlined),
    'REVERSED': ('Reversed', Color(0xFFAFBCDA), Color(0xFF1E2B4D), Icons.undo),
    'VOID': ('Cancelled', Color(0xFFAFBCDA), Color(0xFF1E2B4D), Icons.block),
  };

  @override
  Widget build(BuildContext context) {
    final (label, fg, bg, icon) = _map[status] ?? (status, const Color(0xFFAFBCDA), const Color(0xFF1E2B4D), Icons.info_outline);
    return Container(
      padding: EdgeInsets.symmetric(horizontal: large ? 12 : 10, vertical: large ? 7 : 5),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: large ? 18 : 15, color: fg),
        const SizedBox(width: 5),
        Text(label, style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: large ? 15 : 13)),
      ]),
    );
  }
}

/// Simple yes/no question. Returns true when confirmed.
Future<bool> showConfirmationDialog(BuildContext context, {required String title, required String message, required String confirmLabel, bool danger = false}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
        FilledButton(
          style: danger ? FilledButton.styleFrom(backgroundColor: AppColors.danger, minimumSize: const Size(0, 44)) : FilledButton.styleFrom(minimumSize: const Size(0, 44)),
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return ok == true;
}

class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.title, this.message, this.icon = Icons.inbox_outlined});
  final String title;
  final String? message;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 48),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 48, color: AppColors.muted.withValues(alpha: 0.5)),
        const SizedBox(height: 12),
        Text(title, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
        if (message != null) ...[
          const SizedBox(height: 6),
          Text(message!, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted)),
        ],
      ]),
    );
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.cloud_off_outlined, size: 48, color: AppColors.danger),
        const SizedBox(height: 12),
        Text(message, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyLarge),
        const SizedBox(height: 16),
        OutlinedButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh), label: const Text('Try again')),
      ]),
    );
  }
}

/// Loads data with [load] and renders loading / error / data states, with pull-to-refresh.
/// Reloads automatically when new notifications arrive (e.g. a bill was published).
class AsyncLoader<T> extends StatefulWidget {
  const AsyncLoader({super.key, required this.load, required this.builder, this.reloadOnNotifications = true});
  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, Future<void> Function() reload) builder;
  final bool reloadOnNotifications;

  @override
  State<AsyncLoader<T>> createState() => _AsyncLoaderState<T>();
}

class _AsyncLoaderState<T> extends State<AsyncLoader<T>> {
  T? _data;
  String? _error;
  bool _loading = true;
  int _seenVersion = -1;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!widget.reloadOnNotifications) return;
    final v = context.watch<NotificationProvider>().version;
    if (_seenVersion != -1 && v != _seenVersion) _reload(silent: true);
    _seenVersion = v;
  }

  Future<void> _reload({bool silent = false}) async {
    if (!silent && mounted) setState(() => _loading = true);
    try {
      final d = await widget.load();
      if (mounted) {
        setState(() {
          _data = d;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = ApiException.from(e).message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _data == null) return const Center(child: CircularProgressIndicator());
    if (_error != null && _data == null) return Center(child: SingleChildScrollView(child: ErrorView(message: _error!, onRetry: _reload)));
    return RefreshIndicator(onRefresh: () => _reload(silent: true), child: widget.builder(context, _data as T, () => _reload(silent: true)));
  }
}

/// Label/value row used in billing breakdowns.
class AmountRow extends StatelessWidget {
  const AmountRow(this.label, this.amount, {super.key, this.bold = false, this.sub, this.color});
  final String label;
  final String amount;
  final bool bold;
  final String? sub;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(fontSize: bold ? 17 : 15, fontWeight: bold ? FontWeight.w700 : FontWeight.w400, color: color);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: style),
            if (sub != null) Text(sub!, style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
          ]),
        ),
        const SizedBox(width: 12),
        Text(amount, style: style.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
      ]),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 20, 4, 8),
        child: Row(children: [
          Expanded(child: Text(text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.ink))),
          ?trailing,
        ]),
      );
}

/// App bar action with unread badge, opening the notifications screen.
class NotificationBell extends StatelessWidget {
  const NotificationBell({super.key});
  @override
  Widget build(BuildContext context) {
    final unread = context.watch<NotificationProvider>().unread;
    return IconButton(
      tooltip: unread > 0 ? 'Notifications ($unread unread)' : 'Notifications',
      onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NotificationsScreen())),
      icon: Badge(isLabelVisible: unread > 0, label: Text(unread > 99 ? '99+' : '$unread'), child: const Icon(Icons.notifications_outlined)),
    );
  }
}

void showSnack(BuildContext context, String message, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message), backgroundColor: error ? AppColors.danger : null, behavior: SnackBarBehavior.floating));
}
