import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

/// App configuration (CLIENT side only; no server secrets ever live in the app).
///
/// Web (flutter run -d edge / chrome): uses the real Firebase project "boardinghouse-6cf61"
/// with its public web config, and the backend on this computer.
/// Android: needs its own app registered in Firebase. Until then it uses the local emulators,
/// or pass the Android config:
///   flutter run --dart-define=FIREBASE_APP_ID=1:...:android:... --dart-define=API_URL=http://PC-IP:5000/api/v1
/// Local emulators anywhere: --dart-define=USE_FIREBASE_EMULATORS=true
class AppConfig {
  static const _apiUrlOverride = String.fromEnvironment('API_URL');
  static const _emulatorsFlag = String.fromEnvironment('USE_FIREBASE_EMULATORS');
  static const _appIdOverride = String.fromEnvironment('FIREBASE_APP_ID');
  static const useAppCheck = bool.fromEnvironment('USE_APP_CHECK', defaultValue: false);

  // ---- Real project (public client values; safe to ship in the app) ----
  static const _projectId = 'boardinghouse-6cf61';
  static const _webApiKey = 'AIzaSyC7yVXtJBzoJFCaDU9XOiXCNogngtF7BCg';
  static const _webAppId = '1:1047826759377:web:2a7a5036e5081b28b40ff0';
  static const _senderId = '1047826759377';

  /// Emulators: when asked explicitly, or on a phone that has no real Android config yet.
  static bool get useEmulators => _emulatorsFlag.isNotEmpty ? _emulatorsFlag == 'true' : !kIsWeb && _appIdOverride.isEmpty;

  /// Address of your computer as seen from the app (10.0.2.2 inside the Android emulator).
  static String get devHost => !kIsWeb && defaultTargetPlatform == TargetPlatform.android ? '10.0.2.2' : 'localhost';

  static String get apiUrl {
    if (_apiUrlOverride.isNotEmpty) return _apiUrlOverride;
    // Opened from the backend itself (http://<this-pc>:5000/app/, e.g. after scanning the QR code):
    // talk to that same computer.
    if (kIsWeb && Uri.base.path.startsWith('/app')) return '${Uri.base.origin}/api/v1';
    return 'http://$devHost:5000/api/v1';
  }

  static String get apiOrigin {
    final uri = Uri.parse(apiUrl);
    return '${uri.scheme}://${uri.authority}';
  }

  static String fileUrl(String path) => path.startsWith('http') ? path : '$apiOrigin$path';

  /// How often the app checks for new notifications when push notifications are not available.
  static const notificationPollInterval = Duration(seconds: 60);

  static FirebaseOptions get firebaseOptions => useEmulators
      ? const FirebaseOptions(
          apiKey: 'demo-api-key',
          appId: '1:000000000000:android:0000000000000000',
          messagingSenderId: '000000000000',
          projectId: 'demo-boardinghouse',
          storageBucket: 'demo-boardinghouse.appspot.com',
        )
      : FirebaseOptions(
          apiKey: const String.fromEnvironment('FIREBASE_API_KEY', defaultValue: _webApiKey),
          appId: _appIdOverride.isNotEmpty ? _appIdOverride : _webAppId,
          messagingSenderId: const String.fromEnvironment('FIREBASE_SENDER_ID', defaultValue: _senderId),
          projectId: const String.fromEnvironment('FIREBASE_PROJECT_ID', defaultValue: _projectId),
          authDomain: '$_projectId.firebaseapp.com',
          storageBucket: '$_projectId.firebasestorage.app',
        );
}
