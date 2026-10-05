import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'config.dart';

/// Firebase Cloud Messaging (phone notifications).
/// Not available with the local emulators or on the web build; the app then checks for
/// new notifications regularly instead, so tenants never miss anything.
class PushService {
  bool get available => !kIsWeb && !AppConfig.useEmulators;
  String? token;
  final _messages = StreamController<RemoteMessage>.broadcast();
  Stream<RemoteMessage> get onMessage => _messages.stream;

  void listen() {
    if (!available) return;
    FirebaseMessaging.onMessage.listen(_messages.add);
    FirebaseMessaging.onMessageOpenedApp.listen(_messages.add);
  }

  /// Asks for permission and registers this phone with the backend.
  Future<void> register(ApiClient api) async {
    if (!available) return;
    try {
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission();
      token = await messaging.getToken();
      if (token != null) await api.post('/auth/devices', data: {'token': token});
      messaging.onTokenRefresh.listen((t) {
        token = t;
        api.post('/auth/devices', data: {'token': t}).catchError((_) => <String, dynamic>{});
      });
    } catch (e) {
      debugPrint('[push] not available: $e');
    }
  }

  Future<void> unregister(ApiClient api) async {
    if (!available || token == null) return;
    try {
      await api.dio.delete('/auth/devices', data: {'token': token});
    } catch (_) {}
  }
}
