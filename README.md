# Boarding House Management System

A boarding-house management system with three parts, running on **Firebase** (Authentication, Cloud Firestore, Cloud Storage, Cloud Messaging and App Check):

| App | Stack | Who uses it |
|---|---|---|
| [`backend/`](backend/) | Node.js, Express 5, Firebase Admin SDK, Socket.IO, node-cron, pdfkit/exceljs | Secure REST API for both apps (all money calculations happen here) |
| [`admin-web/`](admin-web/) | React 19, Vite, React Router, Tailwind CSS 4, Firebase JS SDK | Boarding-house owner |
| [`tenant-mobile/`](tenant-mobile/) | Flutter (Material 3), Firebase Auth/Messaging/App Check, Dio, Provider | Boarders (tenants) |
| [`firebase/`](firebase/) | Firestore & Storage security rules, indexes, rules tests | Shared |

Sign-in uses Firebase Authentication with an `ADMIN` or `TENANT` role (a custom claim). The backend checks the role on every request, and the security rules check it again.
Every dashboard figure, bill, balance and report is computed by the backend from Firestore records.

## Quick start (development, no Firebase account needed)

Development runs entirely on the local **Firebase Emulator Suite**. Requirements: Node.js 20+ and Flutter 3.41+.
Java is needed by the emulators. `npm run setup:java` downloads a private copy into `.tools/`, so nothing is installed system-wide.

Use four terminals:

```bash
# 1. Firebase emulators (project root). Data is kept in .firebase-data between runs
npm install
npm run setup:java             # first time only
npm run emulators              # Auth :9099, Firestore :8080, Storage :9199, Emulator UI http://localhost:4000

# 2. Backend API
cd backend
npm install
npm run seed                   # first time only: sample rooms, tenants, bills, payments
npm start                      # http://localhost:5000/api/v1

# 3. Admin web
cd admin-web
npm install
npm start                      # http://localhost:5173

# 4. Tenant app
cd tenant-mobile
flutter pub get
flutter run -d edge            # or -d chrome. Android emulator: flutter run
```

`npm run seed:reset` (backend) wipes the emulator data and reloads the samples. It refuses to run against a real Firebase project.

**Development accounts.** The login pages list them; click one, then **Sign In**.

| Role | Email | Password |
|---|---|---|
| Owner (admin web) | `admin@boardinghouse.local` | `Admin@12345` |
| Tenant (mobile app) | `maria@example.com`, `juan@example.com`, `jose@example.com` (overdue), `ana@example.com`, … | `Tenant@123` |

> If an older version of the backend is still running on port 5000, stop it first (Ctrl+C in its terminal).

## Documentation

- [docs/SETUP.md](docs/SETUP.md): installation, connecting a real Firebase project, **client vs server configuration**, deployment
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): architecture, Firestore collections, Storage folders, security model, workflows
- [docs/API.md](docs/API.md): REST API reference
- [docs/TESTING.md](docs/TESTING.md): automated and manual testing

## Features that need external configuration

| Feature | In development | How to enable |
|---|---|---|
| Push notifications (FCM) | In-app notifications + real-time updates (admin) + regular checks (mobile) | Real Firebase project + service account on the backend (see SETUP) |
| Email (sending new tenants their login) | The owner sees the temporary password once and shares it | `SMTP_*` variables |
| Password reset | Firebase sends the reset email (the Auth emulator shows the link in its log/UI) | Works automatically with a real project |
| App Check | Off | Register the apps in App Check, then set `APP_CHECK_ENFORCE=true` |
| Online payment gateway | **Not simulated.** All payments are verified by the owner | Not included. A gateway webhook would call `payment.service.confirmPayment` |
