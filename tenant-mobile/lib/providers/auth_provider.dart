import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../core/api_client.dart';
import '../core/push_service.dart';

/// pending = signed up in the app, waiting for the owner's approval; rejected = the owner did not approve it.
/// The backend decides (never the app alone): it refuses data to any account that isn't approved.
enum AuthStatus { unknown, signedOut, signedIn, pending, rejected }

/// Sign-in state, handled by Firebase Authentication (it keeps the session securely
/// on the phone and refreshes it automatically).
class AuthProvider extends ChangeNotifier {
  AuthProvider(this.api, this.push, {FlutterSecureStorage? storage}) : _storage = storage ?? const FlutterSecureStorage() {
    api.onSessionExpired = _expire;
  }

  final ApiClient api;
  final PushService push;
  final FlutterSecureStorage _storage;
  StreamSubscription<User?>? _sub;

  AuthStatus status = AuthStatus.unknown;
  Map<String, dynamic>? user;
  String? notice;
  /// Name shown on the "waiting for approval" screen.
  String? pendingName;
  /// The waiting / not-approved account: name, email, registeredAt, rejectionReason, house contact.
  Map<String, dynamic>? account;
  bool _registering = false;

  String get name => user?['name'] as String? ?? '';
  String get email => user?['email'] as String? ?? '';
  bool get mustChangePassword => user?['mustChangePassword'] == true;

  /// Reads the saved sign-in (Firebase restores it during initializeApp) and keeps
  /// listening for changes. Sign-in and sign-out also update the state directly,
  /// because the web build of firebase_auth does not always deliver these events.
  void start() {
    _sub ??= api.auth.authStateChanges().listen(_onUser);
    _onUser(api.auth.currentUser);
  }

  String? _handledUid;
  bool _handledOnce = false;

  Future<void> _onUser(User? fbUser) async {
    // During sign-up the account record doesn't exist yet; register() finishes the job.
    if (_registering && fbUser != null) return;
    // The same state can arrive both directly and from the stream; handle it once.
    if (_handledOnce && fbUser?.uid == _handledUid) return;
    _handledOnce = true;
    _handledUid = fbUser?.uid;
    if (fbUser == null) {
      user = null;
      status = AuthStatus.signedOut;
      notifyListeners();
      return;
    }
    try {
      final token = await fbUser.getIdTokenResult();
      if (token.claims?['role'] != 'TENANT') {
        // A tenant who signed up in the app has no access until the owner approves them.
        final st = await api.get('/auth/status');
        final state = st['status'];
        if (st['registered'] == true && st['role'] == 'TENANT' && (state == 'PENDING' || state == 'REJECTED')) {
          pendingName = st['name'] as String?;
          account = st;
          user = null;
          status = state == 'PENDING' ? AuthStatus.pending : AuthStatus.rejected;
          notifyListeners();
          return;
        }
        if (st['registered'] == true && state == 'INACTIVE') {
          notice = 'Your account has been temporarily suspended. Please contact the boarding house.';
          await _signOut();
          return;
        }
        notice = 'This app is for tenants. Owners please use the admin website.';
        await _signOut();
        return;
      }
      final res = await api.get('/auth/me', query: {'login': '1'});
      if (_handledUid != fbUser.uid) return; // signed out meanwhile
      user = res['user'] as Map<String, dynamic>?;
      status = AuthStatus.signedIn;
      push.register(api);
    } catch (e) {
      notice = ApiException.from(e).message;
      await _signOut();
      return;
    }
    notifyListeners();
  }

  Future<void> _signOut() async {
    try {
      await api.auth.signOut();
    } finally {
      await _onUser(null);
    }
  }

  /// New tenant creates an account. It waits for the owner's approval before they can see anything.
  Future<void> register({
    required String name,
    required String email,
    String? phone,
    required String password,
    String? requestedRoom,
    DateTime? requestedMoveIn,
    String? occupation,
    String? address,
    DateTime? birthDate,
    String? emergencyName,
    String? emergencyRelationship,
    String? emergencyPhone,
  }) async {
    String day(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    bool has(String? v) => v != null && v.isNotEmpty;
    notice = null;
    _registering = true;
    User? created;
    try {
      final cred = await api.auth.createUserWithEmailAndPassword(email: email, password: password);
      created = cred.user;
      await api.post('/auth/register', data: {
        'name': name,
        if (phone != null && phone.isNotEmpty) 'phone': phone,
        if (requestedRoom != null && requestedRoom.isNotEmpty) 'requestedRoom': requestedRoom,
        if (requestedMoveIn != null) 'requestedMoveIn': day(requestedMoveIn),
        if (has(occupation)) 'occupation': occupation,
        if (has(address)) 'address': address,
        if (birthDate != null) 'birthDate': day(birthDate),
        if (has(emergencyName) || has(emergencyPhone))
          'emergencyContact': {
            if (has(emergencyName)) 'name': emergencyName,
            if (has(emergencyRelationship)) 'relationship': emergencyRelationship,
            if (has(emergencyPhone)) 'phone': emergencyPhone,
          },
      });
      _storage.write(key: 'last_email', value: email).catchError((_) {});
    } on FirebaseAuthException catch (e) {
      if (e.code == 'email-already-in-use') throw ApiException('An account with this email already exists. Please sign in instead.');
      if (e.code == 'weak-password' || e.code == 'password-does-not-meet-requirements') {
        throw ApiException('Your password must have at least 8 characters, an uppercase letter, a lowercase letter and a number.');
      }
      if (e.code == 'invalid-email') throw ApiException('Please enter a valid email address.');
      throw ApiException(ApiException.authMessage(e));
    } catch (e) {
      // The login was made but the account record wasn't: undo so they can simply try again.
      await created?.delete().catchError((_) {});
      rethrow;
    } finally {
      _registering = false;
    }
    _handledOnce = false;
    await _onUser(api.auth.currentUser);
  }

  /// "Check again" on the waiting screen: picks up the owner's approval (a fresh sign-in token).
  Future<bool> checkApproval() async {
    final u = api.auth.currentUser;
    if (u == null) return false;
    await u.getIdToken(true);
    _handledOnce = false;
    await _onUser(u);
    return status == AuthStatus.signedIn;
  }

  /// The last email used on this phone (kept in secure storage for convenience).
  Future<String?> lastEmail() async {
    try {
      return await _storage.read(key: 'last_email');
    } catch (_) {
      return null;
    }
  }

  Future<void> login(String email, String password) async {
    notice = null;
    try {
      final cred = await api.auth.signInWithEmailAndPassword(email: email, password: password);
      _storage.write(key: 'last_email', value: email).catchError((_) {});
      await _onUser(cred.user);
    } on FirebaseAuthException catch (e) {
      throw ApiException(ApiException.authMessage(e));
    }
  }

  Future<void> sendPasswordReset(String email) async {
    try {
      await api.auth.sendPasswordResetEmail(email: email);
    } on FirebaseAuthException catch (e) {
      if (e.code == 'user-not-found') return; // never reveal whether an account exists
      throw ApiException(ApiException.authMessage(e));
    }
  }

  Future<void> changePassword(String current, String next) async {
    final u = api.auth.currentUser;
    if (u == null || u.email == null) throw ApiException('Please sign in again.');
    try {
      await u.reauthenticateWithCredential(EmailAuthProvider.credential(email: u.email!, password: current));
      await u.updatePassword(next);
    } on FirebaseAuthException catch (e) {
      if (e.code == 'invalid-credential' || e.code == 'wrong-password') throw ApiException('Your current password is not correct.');
      throw ApiException(ApiException.authMessage(e));
    }
    await api.post('/auth/password-changed');
    user = {...?user, 'mustChangePassword': false};
    notifyListeners();
  }

  void updateUser(Map<String, dynamic> u) {
    user = {...?user, ...u};
    notifyListeners();
  }

  Future<void> logout() async {
    await push.unregister(api);
    await _signOut();
  }

  void _expire() {
    if (status != AuthStatus.signedIn) return;
    notice = 'Please sign in again.';
    _signOut();
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
