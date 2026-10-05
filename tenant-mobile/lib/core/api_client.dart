import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'config.dart';

/// A message that can be shown to the tenant as-is (never technical).
class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;

  @override
  String toString() => message;

  static ApiException from(Object error) {
    if (error is ApiException) return error;
    if (error is FirebaseAuthException) return ApiException(authMessage(error));
    if (error is DioException) {
      final status = error.response?.statusCode;
      final data = error.response?.data;
      if (data is Map && data['message'] is String && (status ?? 500) < 500) return ApiException(data['message'] as String, statusCode: status);
      switch (error.type) {
        case DioExceptionType.connectionTimeout:
        case DioExceptionType.receiveTimeout:
        case DioExceptionType.sendTimeout:
          return ApiException('This is taking too long. Please check your internet and try again.', statusCode: status);
        case DioExceptionType.connectionError:
          return ApiException('We can’t connect right now. Please check your internet connection.', statusCode: status);
        default:
          if (status == 401) return ApiException('Please sign in again.', statusCode: 401);
          return ApiException(
            error.requestOptions.method == 'GET' ? 'We couldn’t load this right now. Please try again.' : 'We couldn’t save this right now. Please try again.',
            statusCode: status,
          );
      }
    }
    return ApiException('Something went wrong. Please try again.');
  }

  /// Friendly messages for Firebase sign-in errors.
  static String authMessage(FirebaseAuthException e) {
    switch (e.code) {
      case 'invalid-credential':
      case 'wrong-password':
      case 'user-not-found':
      case 'invalid-email':
        return 'The email or password is incorrect.';
      case 'user-disabled':
        return 'Your account has been temporarily suspended. Please contact the boarding house.';
      case 'too-many-requests':
        return 'Too many attempts. Please wait a few minutes and try again.';
      case 'network-request-failed':
        return 'We can’t connect right now. Please check your internet connection.';
      case 'weak-password':
      case 'password-does-not-meet-requirements':
        return 'Your password must have at least 8 characters, an uppercase letter, a lowercase letter and a number.';
      case 'requires-recent-login':
        return 'For your security, please sign out and sign in again, then try once more.';
      default:
        return 'We couldn’t sign you in. Please try again.';
    }
  }
}

/// Talks to the backend. Every request carries the tenant's Firebase ID token.
class ApiClient {
  ApiClient({Dio? dio, FirebaseAuth? auth})
      : _auth = auth,
        dio = dio ?? Dio(BaseOptions(baseUrl: AppConfig.apiUrl, connectTimeout: const Duration(seconds: 15), receiveTimeout: const Duration(seconds: 30))) {
    this.dio.interceptors.add(InterceptorsWrapper(
          onRequest: (options, handler) async {
            final token = await idToken(forceRefresh: options.extra['retried'] == true);
            if (token != null) options.headers['Authorization'] = 'Bearer $token';
            if (AppConfig.useAppCheck) {
              try {
                final ac = await FirebaseAppCheck.instance.getToken();
                if (ac != null) options.headers['X-Firebase-AppCheck'] = ac;
              } catch (_) {}
            }
            handler.next(options);
          },
          onError: (error, handler) async {
            final req = error.requestOptions;
            if (error.response?.statusCode == 401 && req.extra['retried'] != true && currentUid != null) {
              req.extra['retried'] = true;
              try {
                return handler.resolve(await this.dio.fetch(req));
              } on DioException catch (e) {
                if (e.response?.statusCode == 401) onSessionExpired?.call();
                return handler.next(e);
              }
            }
            handler.next(error);
          },
        ));
  }

  final Dio dio;
  final FirebaseAuth? _auth;
  void Function()? onSessionExpired;

  /// Override in tests to supply a token without Firebase.
  Future<String?> Function({bool forceRefresh})? tokenProvider;

  FirebaseAuth get auth => _auth ?? FirebaseAuth.instance;
  String? get currentUid => tokenProvider != null ? 'test' : auth.currentUser?.uid;

  Future<String?> idToken({bool forceRefresh = false}) async {
    if (tokenProvider != null) return tokenProvider!(forceRefresh: forceRefresh);
    return auth.currentUser?.getIdToken(forceRefresh);
  }

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? query}) => _wrap(() => dio.get(path, queryParameters: query));
  Future<Map<String, dynamic>> post(String path, {Object? data}) => _wrap(() => dio.post(path, data: data));
  Future<Map<String, dynamic>> patch(String path, {Object? data}) => _wrap(() => dio.patch(path, data: data));
  Future<Map<String, dynamic>> delete(String path) => _wrap(() => dio.delete(path));

  Future<Uint8List> getBytes(String path) async {
    try {
      final res = await dio.get<List<int>>(path, options: Options(responseType: ResponseType.bytes));
      return Uint8List.fromList(res.data ?? const []);
    } catch (e) {
      throw ApiException.from(e);
    }
  }

  Future<Map<String, dynamic>> _wrap(Future<Response<dynamic>> Function() call) async {
    try {
      final res = await call();
      final data = res.data;
      return data is Map<String, dynamic> ? data : <String, dynamic>{};
    } catch (e) {
      throw ApiException.from(e);
    }
  }
}
