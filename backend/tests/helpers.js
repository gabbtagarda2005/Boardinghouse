// Tests run against the Firebase Emulator Suite (started by `npm test`).
process.env.NODE_ENV = 'test';
process.env.USE_FIREBASE_EMULATORS = 'true';
process.env.FIREBASE_PROJECT_ID = 'demo-boardinghouse';

const request = require('supertest');
const PROJECT = 'demo-boardinghouse';

async function clearAll() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  require('../src/services/settings.service').resetSettingsCache();
}

function makeApp() {
  return require('../src/app').createApp();
}

/** Signs in through the Auth emulator and returns a Firebase ID token. */
async function signIn(email, password) {
  const res = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await res.json();
  if (!body.idToken) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(body)}`);
  return body.idToken;
}

async function createAdmin() {
  const accounts = require('../src/services/accounts.service');
  await accounts.createAccount({ email: 'owner@test.local', password: 'Admin@12345', name: 'Owner', role: 'ADMIN', mustChangePassword: false });
  return signIn('owner@test.local', 'Admin@12345');
}

module.exports = { request, clearAll, makeApp, signIn, createAdmin };
