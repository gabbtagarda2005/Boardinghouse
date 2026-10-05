import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:firebase_auth/firebase_auth.dart' show FirebaseAuth;
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

import 'core/api_client.dart';
import 'core/config.dart';
import 'core/push_service.dart';
import 'core/theme.dart';
import 'providers/auth_provider.dart';
import 'providers/branding_provider.dart';
import 'providers/notification_provider.dart';
import 'screens/auth/change_password_screen.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/pending_screen.dart';
import 'screens/shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('en_PH');
  await Firebase.initializeApp(options: AppConfig.firebaseOptions);
  if (AppConfig.useEmulators) {
    await FirebaseAuth.instance.useAuthEmulator(AppConfig.devHost, 9099);
  } else if (AppConfig.useAppCheck) {
    await FirebaseAppCheck.instance.activate(providerAndroid: const AndroidPlayIntegrityProvider());
  }
  final push = PushService()..listen();
  final api = ApiClient();
  final auth = AuthProvider(api, push)..start();
  runApp(BoardingHouseApp(api: api, auth: auth, push: push));
}

class BoardingHouseApp extends StatelessWidget {
  const BoardingHouseApp({super.key, required this.api, required this.auth, required this.push});
  final ApiClient api;
  final AuthProvider auth;
  final PushService push;

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: api),
        ChangeNotifierProvider<AuthProvider>.value(value: auth),
        ChangeNotifierProvider(create: (_) => NotificationProvider(api, push)),
        ChangeNotifierProvider(create: (_) => BrandingProvider(api)..load()),
      ],
      child: MaterialApp(title: 'MCLEY Tenant', debugShowCheckedModeBanner: false, theme: buildTheme(), scrollBehavior: const _NoScrollbars(), home: const AuthGate()),
    );
  }
}

/// Shows the right first screen for the sign-in state.
class AuthGate extends StatefulWidget {
  const AuthGate({super.key});
  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  AuthStatus? _last;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    if (auth.status != _last) {
      final notifications = context.read<NotificationProvider>();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (auth.status == AuthStatus.signedIn) {
          notifications.start();
        } else {
          notifications.stop();
          Navigator.of(context).popUntil((r) => r.isFirst);
        }
      });
      _last = auth.status;
    }
    switch (auth.status) {
      case AuthStatus.unknown:
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      case AuthStatus.signedOut:
        return const LoginScreen();
      case AuthStatus.pending:
      case AuthStatus.rejected:
        return const PendingApprovalScreen();
      case AuthStatus.signedIn:
        return auth.mustChangePassword ? const ChangePasswordScreen(forced: true) : const AppShell();
    }
  }
}

/// Scrolling works as usual (touch, mouse wheel, trackpad), but no scrollbars are drawn.
class _NoScrollbars extends MaterialScrollBehavior {
  const _NoScrollbars();
  @override
  Widget buildScrollbar(BuildContext context, Widget child, ScrollableDetails details) => child;
}
