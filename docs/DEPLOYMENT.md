# Deployment guide

How the live system fits together:

```
Owner's browser ─┐
Visitors (/inquire)┼─► Netlify (admin-web: React) ─┐
                   │                                ├─► Render (backend: Node.js + Express) ─┬─► Firebase (sign-in + Firestore database)
Tenant phone ──────┴─► Android app (Flutter) ───────┘                                         └─► Supabase Storage (photos, proofs, receipts)
```

- **Netlify** hosts the admin website and the public pages (`/login`, `/inquire`, `/tenant-app`).
- **Render** runs the API. Every read and write goes through it; it checks who is signed in and what they may do.
- **Firebase** keeps the sign-in accounts and the database (one project: `boardinghouse-6cf61`). Free Spark plan.
- **Supabase** stores the uploaded files in one private bucket (`boardinghouse-files`). Free plan.
- **Secrets live only on Render.** Netlify and the Android app get public values only.

> Why Firebase and not a Supabase database: sign-in (incl. Google sign-in for the owner), the database
> and the security rules were built and tested on Firebase. Supabase is used where it is strongest on the
> free plan: file storage. There is still exactly one source of truth (the Firestore database).

---

## 1. Before you start

You need: a GitHub account with this repository, a Netlify account, a Render account, and access to the
Firebase project (`console.firebase.google.com`) and the Supabase project (`supabase.com/dashboard`).

Things you'll copy from your computer (never commit them):

| What | Where it is on your computer |
|---|---|
| Firebase service-account JSON (server key) | `backend/firebase-service-account.json` |
| Supabase URL + secret key | `backend/.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`) |
| Firebase web config (public) | `admin-web/.env.firebase` (`VITE_FIREBASE_*`) |

---

## 2. Render (backend API)

1. Render → **New → Blueprint** → choose this GitHub repository. Render reads [`render.yaml`](../render.yaml):
   web service `mcley-boardinghouse-api`, folder `backend`, build `npm ci --omit=dev`, start `npm start`,
   health check `/api/health`, free plan, Singapore region.
2. Fill in the values Render asks for (Environment tab):

| Variable | Value |
|---|---|
| `FIREBASE_PROJECT_ID` | `boardinghouse-6cf61` |
| `FIREBASE_SERVICE_ACCOUNT` | the **whole contents** of `firebase-service-account.json`, pasted as one value |
| `SUPABASE_URL` | your Supabase project URL (`https://….supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | the Supabase **secret** key (`sb_secret_…`) |
| `FRONTEND_URL` | your Netlify address, e.g. `https://mcley-boardinghouse.netlify.app` (no slash at the end) |
| `TENANT_APP_URL` | the APK download link from step 5 (can be added later) |

   Already set by `render.yaml`: `NODE_ENV=production`, `NODE_VERSION=22`, `TIMEZONE=Asia/Manila`,
   `USE_FIREBASE_EMULATORS=false`, `FILE_STORAGE=supabase`, `SUPABASE_BUCKET=boardinghouse-files`.
   Render sets `PORT` itself; the server listens on `0.0.0.0:$PORT`.
3. Deploy. Open `https://<your-service>.onrender.com/api/health`: it must show `{"status":"ok"}`.
   If the name `mcley-boardinghouse-api` was taken, Render gives a different address: use **your** address
   everywhere below (and in the Android build, step 5).

Optional: `CORS_ORIGINS` (extra allowed sites, comma-separated), `SMTP_*` (email), `APP_CHECK_ENFORCE`.

---

## 3. Netlify (admin website + public pages)

1. Netlify → **Add new site → Import an existing project** → this GitHub repository.
   [`netlify.toml`](../netlify.toml) sets everything: base `admin-web`, build `npm run build`, publish `dist`,
   and the single-page-app rule so refreshing `/rooms`, `/inquire/rooms/…` etc. never shows "Page not found".
2. Site settings → **Environment variables**:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://<your-service>.onrender.com/api/v1` |
| `VITE_USE_FIREBASE_EMULATORS` | `false` |
| `VITE_FIREBASE_API_KEY` | from `admin-web/.env.firebase` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `boardinghouse-6cf61.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `boardinghouse-6cf61` |
| `VITE_FIREBASE_APP_ID` | from `admin-web/.env.firebase` |

   These are public client values (they are visible in any browser anyway). The build **stops with a clear
   message** if `VITE_API_URL` or a Firebase value is missing, so a broken site is never published.
3. Deploy, then note the address (e.g. `https://mcley-boardinghouse.netlify.app`). You can rename the site in
   Site settings → Change site name.

## 4. Connect them

1. Render → `FRONTEND_URL` = the exact Netlify address → Save (Render redeploys).
2. Firebase console → **Authentication → Settings → Authorized domains → Add domain** → your Netlify domain
   (e.g. `mcley-boardinghouse.netlify.app`). Without this, "Sign in with Google" is refused on the live site.
3. Open the Netlify site → sign in with your MCLEY Gmail.

---

## 5. Android tenant app (APK)

The app's one configuration file is [`tenant-mobile/lib/core/config.dart`](../tenant-mobile/lib/core/config.dart).
Release builds use the Render API (`productionApiUrl`) and the real Firebase project (Android app registered
as `com.boardinghouse.boarding_house_tenant`).

```bash
cd tenant-mobile
flutter pub get
# If your Render address is not mcley-boardinghouse-api.onrender.com, pass yours:
flutter build apk --release --dart-define=API_URL=https://<your-service>.onrender.com/api/v1
# → build/app/outputs/flutter-apk/app-release.apk
```

Share it with tenants:

1. GitHub → this repository → **Releases → Draft a new release** → tag `v1.0.0` → attach `app-release.apk`
   (rename it `mcley-tenant.apk`) → Publish.
2. Copy the file's link (`https://github.com/<you>/Boardinghouse/releases/download/v1.0.0/mcley-tenant.apk`)
   into Render → `TENANT_APP_URL`.
3. The login page QR code and **Download Tenant App** button now open `/tenant-app`, which offers the APK with
   install steps on Android phones.

For Google Play later: `flutter build appbundle --release` (needs your own upload key in
`android/app/build.gradle.kts`, see flutter.dev/deployment/android). Set `TENANT_APP_URL` to the Play Store page.

---

## Every setting, by place

| Place | Variable | Secret? | Notes |
|---|---|---|---|
| Render | `NODE_ENV` | no | `production` (from render.yaml) |
| Render | `PORT` | no | set by Render |
| Render | `FIREBASE_PROJECT_ID` | no | `boardinghouse-6cf61` |
| Render | `FIREBASE_SERVICE_ACCOUNT` | **yes** | server key JSON |
| Render | `USE_FIREBASE_EMULATORS` | no | `false` |
| Render | `FILE_STORAGE` | no | `supabase` |
| Render | `SUPABASE_URL` | no | project URL |
| Render | `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Supabase secret key |
| Render | `SUPABASE_BUCKET` | no | `boardinghouse-files` |
| Render | `FRONTEND_URL` | no | Netlify address (CORS) |
| Render | `TENANT_APP_URL` | no | APK / Play Store link |
| Render | `TIMEZONE` | no | `Asia/Manila` |
| Netlify | `VITE_API_URL` | no | Render address + `/api/v1` |
| Netlify | `VITE_USE_FIREBASE_EMULATORS` | no | `false` |
| Netlify | `VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID` | no | Firebase web config |
| Flutter (build) | `API_URL` | no | only if your Render address differs (`--dart-define`) |
| Firebase | Authorized domains | no | add the Netlify domain |
| Supabase | bucket `boardinghouse-files` | — | private (already created); the secret key stays on Render |

Not used in this setup (so don't add them): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY`,
`JWT_SECRET`. Sign-in tokens come from Firebase and are checked by the backend; the apps never talk to Supabase.

---

## Free-plan notes

- **Render free** sleeps after ~15 minutes without visitors; the first request then takes up to a minute.
  The daily bill reminders (8:00 AM) only run while it is awake. To keep it awake, add a free monitor
  (e.g. UptimeRobot) that opens `/api/health` every 10 minutes.
- **Firebase Spark**: 50,000 database reads and 20,000 writes per day, plenty for one boarding house.
- **Supabase free**: 1 GB of files. Projects with no activity for a week can be paused; opening the Supabase
  dashboard wakes it.
- Password reset emails come from Firebase (`noreply@boardinghouse-6cf61.firebaseapp.com`) and may land in Spam.

---

## Deployment checklist

**Before**
- [ ] `git status` is clean and pushed to GitHub (no `.env`, no service-account file, no `backups/`).
- [ ] Backend tests pass: `cd backend && npm test`.

**Render**
- [ ] Blueprint created from `render.yaml`.
- [ ] `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` set.
- [ ] `https://<service>.onrender.com/api/health` shows `{"status":"ok"}`.

**Netlify**
- [ ] `VITE_API_URL` and the four `VITE_FIREBASE_*` values set, `VITE_USE_FIREBASE_EMULATORS=false`.
- [ ] Deploy succeeded.

**Connect**
- [ ] Render `FRONTEND_URL` = Netlify address.
- [ ] Netlify domain added to Firebase **Authorized domains**.

**Android**
- [ ] `flutter build apk --release` (with `--dart-define=API_URL=…` if needed).
- [ ] APK uploaded to a GitHub Release; Render `TENANT_APP_URL` = its link.

**Test on the live site** (see docs/TESTING.md for the full list)
- [ ] Owner: sign in (Google + password), dashboard, add a room, add/approve a tenant, electricity, create and
      send a bill, verify a payment, inquiries, announcements, reports, Activity History, Give a New Password.
- [ ] Tenant (APK): create account → Pending screen → owner approves → dashboard, room, bill, submit payment,
      payment history, notifications, forgot password.
- [ ] Public: `/login` → Send Inquiry → `/inquire` → rooms with live availability → room page → inquiry sent;
      Tenant App button → `/tenant-app`.
- [ ] Refresh `/rooms`, `/inquire/rooms/<id>`: no "Page not found".
