# Installation & Setup

The system has three apps plus shared Firebase files:

```
backend/        Node.js API: the ONLY place with server credentials (Firebase Admin SDK)
admin-web/      React owner website: Firebase CLIENT config only
tenant-mobile/  Flutter tenant app: Firebase CLIENT config only
firebase/       firestore.rules, storage.rules, firestore.indexes.json, rules tests
firebase.json   emulator ports + rules/index file locations
```

## Client vs server configuration

This split matters for security.

| | Where | What it contains | Secret? |
|---|---|---|---|
| **Server** | `backend/.env`, `backend/firebase-service-account.json` | Service-account private key, project id, storage bucket, SMTP password | **Yes.** Keep these files on the server only. Both are git-ignored |
| **Client (web)** | `admin-web/.env` (`VITE_FIREBASE_*`) | Web API key, auth domain, project id, app id, App Check site key | No. These only identify the project; the security rules and the backend protect the data |
| **Client (mobile)** | `--dart-define` values (or `google-services.json`) | API key, app id, sender id, project id, bucket | No |

Never put the service-account JSON, or anything from `backend/.env`, into `admin-web/` or `tenant-mobile/`.
The web and mobile apps never write to Firestore directly; all writes go through the backend, which checks the role and validates every request.

## 1. Development with the local emulators (default)

No Firebase account is needed. The emulators use the demo project id `demo-boardinghouse`.

```bash
npm install                 # project root: firebase-tools + rules-testing libraries
npm run setup:java          # first time: downloads a private Java 21 runtime to .tools/jre
npm run emulators           # keeps data in .firebase-data between runs
# npm run emulators:fresh   # start with empty emulators (nothing saved)
```

| Emulator | Address |
|---|---|
| Authentication | `localhost:9099` |
| Firestore | `localhost:8080` |
| Storage | `localhost:9199` |
| Emulator UI (browse data, see password-reset links) | http://localhost:4000 |

Then start the backend, the admin web and the tenant app (see the README quick start).

### Backend commands (`backend/`)

| Command | What it does |
|---|---|
| `npm start` / `node server.js` | Starts the API on `http://localhost:5000/api/v1` (`GET /api/v1/health` returns `{status:"ok"}`) |
| `npm run dev` | Same, restarting when files in `src/` change |
| `npm run seed` | Loads development sample data (skipped if data already exists) |
| `npm run seed:reset` | Wipes and reloads the sample data. **Emulators only**: it refuses to run against a real project |
| `npm run create-admin -- --email you@example.com --name "Owner" --password "Your-pass1"` | Creates an owner account (use this for a real project; no sample data) |
| `npm test` | Starts temporary emulators and runs the backend tests |

## 2. Connecting a real Firebase project

1. **Create the project** in the [Firebase console](https://console.firebase.google.com).
2. **Authentication** → Get started → enable **Email/Password**.
3. **Firestore Database** → Create database (production mode; choose a region near you, e.g. `asia-southeast1`).
4. **Storage** → Get started. New projects need the **Blaze (pay-as-you-go)** plan for Cloud Storage; small boarding houses normally stay within the free usage.
5. **Cloud Messaging** is enabled by default.
6. **Register the apps** (Project settings → General → Your apps):
   - a **Web app** for the admin website: copy its config into `admin-web/.env`
   - an **Android app** (package `com.boardinghouse.boarding_house_tenant`, or your own id) for the tenant app
7. **Server key** (Project settings → Service accounts → Generate new private key). Save it as
   `backend/firebase-service-account.json`. Never commit, email or share this file.
8. **Deploy the security rules and indexes** from the project root:
   ```bash
   npx firebase login
   npx firebase use --add          # choose your project
   npm run deploy:rules            # firestore.rules, firestore.indexes.json, storage.rules
   ```
9. **Backend** `backend/.env`:
   ```
   NODE_ENV=production
   USE_FIREBASE_EMULATORS=false
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
   FIREBASE_SERVICE_ACCOUNT=./firebase-service-account.json
   CORS_ORIGINS=https://admin.your-domain.com
   ```
   On Google Cloud (Cloud Run and similar) you can leave `FIREBASE_SERVICE_ACCOUNT` empty to use the platform's default credentials.
   The backend refuses to start with `USE_FIREBASE_EMULATORS=true` when `NODE_ENV=production`.
10. **First owner account**: `npm run create-admin -- --email owner@example.com --name "Owner" --password "Your-pass1"`.
11. **Admin web** `admin-web/.env`:
    ```
    VITE_USE_FIREBASE_EMULATORS=false
    VITE_API_URL=/api/v1
    VITE_FIREBASE_API_KEY=...
    VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
    VITE_FIREBASE_PROJECT_ID=your-project-id
    VITE_FIREBASE_APP_ID=...
    ```
12. **Tenant app**: pass the client config at build time:
    ```bash
    flutter build apk --release \
      --dart-define=USE_FIREBASE_EMULATORS=false \
      --dart-define=API_URL=https://your-domain/api/v1 \
      --dart-define=FIREBASE_API_KEY=... --dart-define=FIREBASE_APP_ID=... \
      --dart-define=FIREBASE_PROJECT_ID=your-project-id --dart-define=FIREBASE_SENDER_ID=... \
      --dart-define=FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
    ```

### Backend environment variables (`backend/.env`)

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `5000` | |
| `NODE_ENV` | `development` | |
| `USE_FIREBASE_EMULATORS` | `true` | Development only |
| `FIREBASE_PROJECT_ID` | `demo-boardinghouse` | |
| `FIREBASE_STORAGE_BUCKET` | `<project>.appspot.com` | |
| `FIREBASE_SERVICE_ACCOUNT` | empty | Path to the key file, or the JSON itself. **Secret** |
| `APP_CHECK_ENFORCE` | `false` | `true` rejects requests without a valid App Check token |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated. In development any `http://localhost:<port>` is also allowed (Flutter web) |
| `MAX_UPLOAD_MB` | `5` | Payment proofs and room photos |
| `REMINDER_CRON` / `TIMEZONE` | `0 8 * * *` / `Asia/Manila` | Daily overdue marking and reminders |
| `SMTP_*`, `MAIL_FROM` | empty | Optional: email new tenants their login |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | dev values | Used by the sample-data seed only |

## 3. Admin web (`admin-web/`)

```bash
npm install
npm start          # development → http://localhost:5173 (Vite proxies /api and /socket.io to the backend)
npm run build      # production build in dist/
npm run lint
```

**Production:** serve `dist/` and the API from the same domain, with a reverse proxy sending `/api` and `/socket.io` to Node. For example, with nginx:

```nginx
location /api/       { proxy_pass http://127.0.0.1:5000; }
location /socket.io/ { proxy_pass http://127.0.0.1:5000; proxy_http_version 1.1;
                       proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }
location /           { root /var/www/admin-web/dist; try_files $uri /index.html; }
```

Firebase Hosting also works for `dist/`, with a rewrite of `/api/**` to the backend (for example on Cloud Run).
Add your website's domain under Authentication → Settings → **Authorized domains**.

## 4. Tenant mobile app (`tenant-mobile/`)

```bash
flutter pub get
flutter run -d edge                                                   # browser → API http://localhost:5000
flutter run                                                           # Android emulator → API http://10.0.2.2:5000
flutter run --dart-define=API_URL=http://192.168.1.20:5000/api/v1   # real phone on the same Wi-Fi (your PC's address)
```

- With the emulators, the app signs in against the Auth emulator automatically (`USE_FIREBASE_EMULATORS` defaults to `true`).
- Debug builds allow plain HTTP. **Release builds require HTTPS.**
- Push notifications are used only with a real Firebase project; without one, the app checks for new notifications regularly.
- If a web build behaves like an old version after you change dependencies, run `flutter clean` and build again.

## 5. App Check (optional, recommended in production)

1. Firebase console → App Check: register the web app (reCAPTCHA v3) and the Android app (Play Integrity).
2. Admin web: set `VITE_FIREBASE_APPCHECK_SITE_KEY`. Tenant app: build with `--dart-define=USE_APP_CHECK=true`.
3. After confirming in the console that requests carry valid tokens, set `APP_CHECK_ENFORCE=true` on the backend
   (and enforce App Check for Firestore and Storage in the console).

## 6. Production checklist

- [ ] `NODE_ENV=production`, `USE_FIREBASE_EMULATORS=false`, HTTPS everywhere
- [ ] Service-account key only on the server, not committed; `CORS_ORIGINS` set to the admin website
- [ ] `npm run deploy:rules` done (rules + indexes); Email/Password sign-in enabled; website domain authorized
- [ ] First owner created with `npm run create-admin` (no sample data in production)
- [ ] Firestore backups (scheduled export) and a Firebase budget alert
- [ ] Optional: SMTP, App Check enforcement
