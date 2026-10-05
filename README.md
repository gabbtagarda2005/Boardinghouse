# MCLEY Boarding House Management System

A boarding-house management system for a non-technical owner and their tenants.

| Part | Stack | Hosted on | Who uses it |
|---|---|---|---|
| [`admin-web/`](admin-web/) | React 19, Vite, Tailwind CSS 4, React Router | **Netlify** | Owner portal + public pages (`/inquire`, `/tenant-app`) |
| [`backend/`](backend/) | Node.js, Express 5, Firebase Admin SDK, Socket.IO | **Render** | Secure REST API for both apps (all money calculations happen here) |
| [`tenant-mobile/`](tenant-mobile/) | Flutter, Dart | **Android APK** | Tenants |
| [`firebase/`](firebase/) | Firestore security rules + indexes | Firebase | Shared |

Sign-in and the database are **Firebase** (Authentication + Cloud Firestore). Uploaded files (room photos,
payment proofs, receipts, profile photos) are in a private **Supabase Storage** bucket. Both apps talk only to
the backend API; the backend checks every request (owner `ADMIN` vs `TENANT`), and the Firestore security rules
check again.

```
admin-web (Netlify) ─┐
                     ├─► backend API (Render) ─► Firebase (sign-in + database) + Supabase Storage (files)
tenant app (Android) ┘
```

## Local development

Requirements: Node.js 20+, Flutter 3.41+. The local **Firebase Emulator Suite** gives you a private copy of
sign-in and the database (Java is needed: `npm run setup:java` downloads a private copy).

```bash
# 1. Firebase emulators (project root)
npm install
npm run setup:java          # first time only
npm run emulators           # Emulator UI: http://localhost:4000

# 2. Backend API
cd backend
cp .env.example .env        # defaults use the emulators
npm install
npm run seed                # first time: sample data (emulators only; refuses the live database)
npm start                   # http://localhost:5000/api/v1  (health: /api/health)

# 3. Admin web
cd admin-web
cp .env.example .env.local
npm install
npm run dev                 # http://localhost:5173

# 4. Tenant app
cd tenant-mobile
flutter pub get
flutter run --dart-define=USE_FIREBASE_EMULATORS=true
```

Sample accounts in the emulators (after `npm run seed`): owner `admin@boardinghouse.local` / `Admin@12345`,
tenants `maria@example.com`, `juan@example.com`, … / `Tenant@123`.

## Production

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**: Render (API), Netlify (website), Android APK, every
environment variable per platform, and the deployment checklist.

- Netlify: build `npm run build`, publish `dist` (from [`netlify.toml`](netlify.toml)).
- Render: build `npm ci --omit=dev`, start `npm start`, health check `/api/health` (from [`render.yaml`](render.yaml)).
- Android: `flutter build apk --release` → share the APK via a GitHub Release.

## Security

- No secrets in GitHub or in the apps: server keys (Firebase service account, Supabase secret key) exist only
  as Render environment variables. `.env` files, the service-account file and `backups/` are git-ignored.
- Passwords are handled by Firebase Authentication and are never stored or shown. The owner can only
  **Give a New Password** (shown once, expires, must be changed) or **Send Password Reset Email**.
- Tenant accounts start **Pending**; only the owner can approve them. Tenants see only their own records.
- Public pages show room availability only (never tenant names or details); inquiries are rate-limited.

## Documentation

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): deployment, environment variables, checklist
- [docs/SETUP.md](docs/SETUP.md): installation, connecting a Firebase project, client vs server configuration
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): architecture, collections, storage, security model, workflows
- [docs/API.md](docs/API.md): REST API reference
- [docs/TESTING.md](docs/TESTING.md): automated and manual testing
