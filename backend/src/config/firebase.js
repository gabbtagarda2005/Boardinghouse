/**
 * Firebase Admin SDK (server side only). Gives the backend trusted access to
 * Authentication, Firestore, Cloud Storage and Cloud Messaging.
 */
const fs = require('fs');
const { initializeApp, cert, applicationDefault, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { getMessaging } = require('firebase-admin/messaging');
const { getAppCheck } = require('firebase-admin/app-check');
const env = require('./env');

const fb = env.firebase;

if (fb.useEmulators) {
  // The Admin SDK talks to the local Emulator Suite when these are set.
  process.env.FIRESTORE_EMULATOR_HOST ||= `${fb.emulatorHost}:8080`;
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= `${fb.emulatorHost}:9099`;
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= `${fb.emulatorHost}:9199`;
}

function credential() {
  if (fb.useEmulators) return undefined;
  if (!fb.serviceAccount) return applicationDefault();
  const raw = fb.serviceAccount.trim().startsWith('{') ? fb.serviceAccount : fs.readFileSync(fb.serviceAccount, 'utf8');
  return cert(JSON.parse(raw));
}

const options = { projectId: fb.projectId, storageBucket: fb.storageBucket || `${fb.projectId}.appspot.com` };
const cred = credential();
if (cred) options.credential = cred;
const app = getApps()[0] || initializeApp(options);

const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

module.exports = {
  app,
  db,
  auth: getAuth(app),
  bucket: () => getStorage(app).bucket(),
  messaging: () => getMessaging(app),
  appCheck: () => getAppCheck(app),
  FieldValue,
  Timestamp,
  usingEmulators: fb.useEmulators,
};
