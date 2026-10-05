// Contract test against a running backend (Firebase emulators + seed data).
// Run:  flutter test test/api_contract_test.dart --dart-define=BH_API=http://localhost:5001/api/v1
// Skipped when BH_API is not provided. Sign-in goes through the Auth emulator (BH_AUTH).
import 'package:boarding_house_tenant/core/api_client.dart';
import 'package:boarding_house_tenant/models/models.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

const apiUrl = String.fromEnvironment('BH_API');
const authEmulator = String.fromEnvironment('BH_AUTH', defaultValue: 'http://127.0.0.1:9099');

Future<String> _idToken(String email) async {
  final res = await Dio().post<Map<String, dynamic>>(
    '$authEmulator/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    data: {'email': email, 'password': 'Tenant@123', 'returnSecureToken': true},
  );
  return res.data!['idToken'] as String;
}

/// [firstToken] lets a test hand out a bad token first, to check the retry with a fresh one.
Future<ApiClient> _signedIn(String email, {String? firstToken}) async {
  final token = await _idToken(email);
  var bad = firstToken;
  final api = ApiClient(dio: Dio(BaseOptions(baseUrl: apiUrl, headers: {'X-Client': 'mobile'})));
  api.tokenProvider = ({bool forceRefresh = false}) async {
    if (bad != null && !forceRefresh) return bad;
    bad = null;
    return token;
  };
  return api;
}

void main() {
  final skip = apiUrl.isEmpty ? 'BH_API not set' : null;

  test('tenant endpoints parse into app models', () async {
    final api = await _signedIn('maria@example.com');
    final home = await api.get('/me/home');
    expect(home['tenant']['name'], 'Maria Santos');
    if (home['currentBill'] != null) Bill.fromJson((home['currentBill'] as Map).cast());

    final bills = await api.get('/me/bills');
    final list = (bills['items'] as List).map((e) => Bill.fromJson((e as Map).cast())).toList();
    expect(list, isNotEmpty);
    expect(list.first.status, isIn(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE']));
    final detail = await api.get('/me/bills/${list.first.id}');
    Bill.fromJson((detail['bill'] as Map).cast());

    final info = PaymentInfo.fromJson(await api.get('/me/payment-info'));
    expect(info.channels, isNotEmpty);

    final payments = await api.get('/me/payments');
    for (final p in payments['items'] as List) {
      final payment = Payment.fromJson((p as Map).cast());
      expect(payment.status, isIn(['PENDING_VERIFICATION', 'CONFIRMED', 'REJECTED', 'REVERSED']));
    }
    final notifications = await api.get('/notifications');
    for (final n in notifications['items'] as List) {
      AppNotification.fromJson((n as Map).cast());
    }
    final room = await api.get('/me/room');
    expect(room['room'], isNotNull);
    expect((room['room'] as Map).containsKey('rating'), isFalse);

    final pdf = await api.getBytes('/me/bills/${list.first.id}/statement.pdf');
    expect(String.fromCharCodes(pdf.take(4)), '%PDF');
  }, skip: skip);

  test('admin-only endpoints are forbidden and other tenants are invisible', () async {
    final juan = await _signedIn('juan@example.com');
    final maria = await _signedIn('maria@example.com');
    final mariaBills = await maria.get('/me/bills');
    final mariaBillId = ((mariaBills['items'] as List).first as Map)['_id'];

    await expectLater(juan.get('/bills'), throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 403)));
    await expectLater(juan.get('/me/bills/$mariaBillId'), throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 404)));
  }, skip: skip);

  test('a rejected token is refreshed once and the request retried', () async {
    final api = await _signedIn('ana@example.com', firstToken: 'expired-or-invalid-token');
    final home = await api.get('/me/home');
    expect(home['tenant'], isNotNull);
  }, skip: skip);
}
