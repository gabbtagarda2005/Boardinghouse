import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api_client.dart';
import '../core/config.dart';
import '../core/push_service.dart';
import '../models/models.dart';

/// Holds the tenant's notifications. Refreshes on push messages (when FCM is configured)
/// and by polling, so notifications always arrive even without push.
class NotificationProvider extends ChangeNotifier {
  NotificationProvider(this.api, this.push) {
    _pushSub = push.onMessage.listen((_) => refresh());
  }

  final ApiClient api;
  final PushService push;
  StreamSubscription<dynamic>? _pushSub;
  Timer? _timer;

  List<AppNotification> items = [];
  int unread = 0;
  bool loading = false;
  String? error;
  int _page = 1;
  bool hasMore = false;

  /// Bumped whenever new data arrives, so screens can reload their own data.
  int version = 0;

  void start() {
    refresh();
    _timer?.cancel();
    _timer = Timer.periodic(AppConfig.notificationPollInterval, (_) => refresh(silent: true));
  }

  void stop() {
    _timer?.cancel();
    items = [];
    unread = 0;
  }

  Future<void> refresh({bool silent = false}) async {
    if (!silent) {
      loading = true;
      error = null;
      notifyListeners();
    }
    try {
      final res = await api.get('/notifications', query: {'page': 1, 'limit': 30});
      final fresh = ((res['items'] as List?) ?? []).map((e) => AppNotification.fromJson((e as Map).cast())).toList();
      final newUnread = (res['unread'] as num?)?.toInt() ?? 0;
      final changed = newUnread != unread || (fresh.isNotEmpty && (items.isEmpty || fresh.first.id != items.first.id));
      items = fresh;
      unread = newUnread;
      _page = 1;
      hasMore = ((res['pages'] as num?) ?? 1) > 1;
      if (changed) version++;
      error = null;
    } on ApiException catch (e) {
      if (!silent) error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> loadMore() async {
    if (!hasMore) return;
    try {
      final res = await api.get('/notifications', query: {'page': _page + 1, 'limit': 30});
      items = [...items, ...((res['items'] as List?) ?? []).map((e) => AppNotification.fromJson((e as Map).cast()))];
      _page++;
      hasMore = ((res['pages'] as num?) ?? 1) > _page;
      notifyListeners();
    } on ApiException {
      // keep current list
    }
  }

  Future<void> markRead(AppNotification n) async {
    if (n.isRead) return;
    items = items.map((x) => x.id == n.id ? x.markRead() : x).toList();
    unread = (unread - 1).clamp(0, 1 << 30);
    notifyListeners();
    try {
      await api.post('/notifications/${n.id}/read');
    } on ApiException {
      // non-critical
    }
  }

  /// Remove one notification (the ✕). Hidden right away; brought back if the server refuses.
  Future<void> remove(AppNotification n) async {
    items = items.where((x) => x.id != n.id).toList();
    if (!n.isRead) unread = (unread - 1).clamp(0, 1 << 30);
    notifyListeners();
    try {
      await api.delete('/notifications/${n.id}');
    } on ApiException {
      await refresh();
    }
  }

  /// "Mark all as read": the notifications are done with, so they are cleared from the list.
  Future<void> markAllRead() async {
    final before = items;
    items = [];
    unread = 0;
    hasMore = false;
    notifyListeners();
    try {
      await api.delete('/notifications');
    } on ApiException {
      items = before; // put them back if it didn't work
      await refresh(silent: true);
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pushSub?.cancel();
    super.dispose();
  }
}
