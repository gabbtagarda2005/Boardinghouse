import 'package:boarding_house_tenant/core/api_client.dart';
import 'package:boarding_house_tenant/core/push_service.dart';
import 'package:boarding_house_tenant/core/theme.dart';
import 'package:boarding_house_tenant/providers/auth_provider.dart';
import 'package:boarding_house_tenant/providers/notification_provider.dart';
import 'package:boarding_house_tenant/screens/auth/login_screen.dart';
import 'package:boarding_house_tenant/widgets/common.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

Widget _wrap(Widget child) {
  // The tokenProvider stands in for Firebase Auth, so no Firebase app is needed here.
  // No network in widget tests: every request (e.g. the login screen's logo lookup) fails at once.
  final dio = Dio()..interceptors.add(InterceptorsWrapper(onRequest: (o, h) => h.reject(DioException(requestOptions: o, message: 'offline (test)'))));
  final api = ApiClient(dio: dio)..tokenProvider = ({bool forceRefresh = false}) async => null;
  final push = PushService();
  return MultiProvider(
    providers: [
      Provider<ApiClient>.value(value: api),
      ChangeNotifierProvider(create: (_) => AuthProvider(api, push)),
      ChangeNotifierProvider(create: (_) => NotificationProvider(api, push)),
    ],
    child: MaterialApp(theme: buildTheme(), home: child),
  );
}

void main() {
  testWidgets('login form validates input before signing in', (tester) async {
    await tester.pumpWidget(_wrap(const LoginScreen()));
    await tester.pump();
    expect(find.text('Welcome back'), findsOneWidget);
    await tester.ensureVisible(find.text('Sign In'));
    await tester.tap(find.text('Sign In'));
    await tester.pump();
    expect(find.text('Please enter your email'), findsOneWidget);
    expect(find.text('Please enter your password'), findsOneWidget);
    // New tenants can sign up (the owner approves them).
    expect(find.text('Create an account'), findsOneWidget);
    // Let the (failed, offline) logo lookup finish so no timers are left running.
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets('status badges always pair color with a text label', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: Column(children: const [StatusBadge('OVERDUE'), StatusBadge('PENDING_VERIFICATION'), StatusBadge('CONFIRMED'), StatusBadge('PARTIALLY_PAID')])),
    ));
    expect(find.text('Overdue'), findsOneWidget);
    expect(find.text('Waiting for verification'), findsOneWidget);
    expect(find.text('Confirmed'), findsOneWidget);
    expect(find.text('Partially paid'), findsOneWidget);
  });

  testWidgets('confirmation dialog returns the choice', (tester) async {
    bool? result;
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (context) => TextButton(
          onPressed: () async => result = await showConfirmationDialog(context, title: 'Sign out?', message: 'Are you sure?', confirmLabel: 'Sign Out'),
          child: const Text('open'),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign Out'));
    await tester.pumpAndSettle();
    expect(result, isTrue);
  });
}
