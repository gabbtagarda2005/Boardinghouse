const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const toInt = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);
const bool = (v, d = false) => (v === undefined || v === '' ? d : v === 'true');

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port: toInt(process.env.PORT, 5000),
  /** Browser sites allowed to call the API: FRONTEND_URL (e.g. the Netlify site) plus CORS_ORIGINS (comma-separated). */
  corsOrigins: [process.env.FRONTEND_URL || '', ...(process.env.CORS_ORIGINS || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173')).split(',')]
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  /** Public link where tenants download the app (e.g. an APK on GitHub Releases or a Play Store page). */
  // Only the first web address counts (protects against a link pasted twice into the setting).
  tenantAppUrl: ((process.env.TENANT_APP_URL || '').trim().match(/^https?:\/\/.+?(?=https?:\/\/|\s|$)/) || [''])[0],

  // ---- Firebase (server / Admin SDK). Never put these in the web or mobile apps. ----
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || 'demo-boardinghouse',
    /** Path to the service-account JSON file, or the JSON itself. Not needed with emulators. */
    serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    /** Development: use the local Firebase Emulator Suite instead of the real project. */
    useEmulators: bool(process.env.USE_FIREBASE_EMULATORS, false),
    emulatorHost: process.env.FIREBASE_EMULATOR_HOST || '127.0.0.1',
    /** Require a valid Firebase App Check token on every API request. */
    enforceAppCheck: bool(process.env.APP_CHECK_ENFORCE, false),
  },

  uploads: { maxMb: toInt(process.env.MAX_UPLOAD_MB, 5) },

  /**
   * Where uploaded files (payment proofs, room photos, receipts) are kept:
   *   "firebase" — Cloud Storage for Firebase (needs the Blaze plan), default
   *   "supabase" — a private Supabase Storage bucket (free plan works)
   */
  files: {
    provider: (process.env.FILE_STORAGE || 'firebase').toLowerCase(),
    supabaseUrl: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
    /** Supabase SECRET key (sb_secret_… or legacy service_role). Server only — never in the apps. */
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '',
    supabaseBucket: process.env.SUPABASE_BUCKET || 'boardinghouse-files',
  },

  reminderCron: process.env.REMINDER_CRON || '0 8 * * *',
  timezone: process.env.TIMEZONE || 'Asia/Manila',

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: toInt(process.env.SMTP_PORT, 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Boarding House <no-reply@example.com>',
  },

  seedAdminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@boardinghouse.local',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345',
};

if (!['firebase', 'supabase'].includes(env.files.provider)) {
  throw new Error('FILE_STORAGE must be "firebase" or "supabase".');
}
if (env.files.provider === 'supabase' && (!env.files.supabaseUrl || !env.files.supabaseKey)) {
  throw new Error('FILE_STORAGE=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY).');
}

if (env.isProd && env.firebase.useEmulators) {
  throw new Error('USE_FIREBASE_EMULATORS must be false in production.');
}

module.exports = env;
