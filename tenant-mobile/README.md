# Boarding House – Tenant App (Flutter)

Android-first Material 3 app for boarders: home summary, my room, bills (with PDF statements),
payment claims with proof upload, receipts, notifications, announcements and profile.

```bash
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:5000/api/v1   # Android emulator → local backend
flutter analyze && flutter test
```

- `lib/core/`: config (`API_URL`), Dio API client with token refresh, secure token storage, formatting, theme, optional FCM
- `lib/providers/`: auth session and notifications (push when configured, polling otherwise)
- `lib/screens/`: login, forgot/reset password, forced password change, shell (bottom navigation), home, room, bills, bill detail, payments, submit payment, payment detail, notifications, announcements, profile
- `lib/widgets/common.dart`: status chips, loading/error/empty states, pull-to-refresh loader

Accounts are created by the admin. There is no self-registration. Payments submitted in the app stay
**Pending verification** until the admin confirms them. Push notifications need Firebase setup (see `../docs/SETUP.md`).
