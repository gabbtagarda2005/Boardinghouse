#!/usr/bin/env node
/**
 * Switch the admin web + backend between the local emulators and the real Firebase project.
 *   npm run use:firebase     → admin-web/.env.firebase  + backend/.env.firebase
 *   npm run use:emulators    → admin-web/.env.emulators + backend/.env.emulators
 * Restart the backend and the admin web (npm start) after switching.
 */
const fs = require('fs');
const path = require('path');

const target = process.argv[2];
if (!['firebase', 'emulators'].includes(target)) {
  console.error('Usage: node scripts/use-env.js firebase|emulators');
  process.exit(1);
}
const root = path.join(__dirname, '..');
if (target === 'firebase' && !fs.existsSync(path.join(root, 'backend', 'firebase-service-account.json'))) {
  console.error('backend/firebase-service-account.json is missing.\nDownload it from Firebase console > Project settings > Service accounts > Generate new private key, and save it there first.');
  process.exit(1);
}
for (const app of ['admin-web', 'backend']) {
  const from = path.join(root, app, `.env.${target}`);
  if (!fs.existsSync(from)) {
    console.error(`Missing ${app}/.env.${target}`);
    process.exit(1);
  }
  fs.copyFileSync(from, path.join(root, app, '.env'));
  console.log(`${app}/.env  ←  .env.${target}`);
}
console.log(`\nNow using: ${target === 'firebase' ? 'your real Firebase project (boardinghouse-6cf61)' : 'the local emulators (run "npm run emulators")'}.`);
console.log('Restart the backend and the admin web (Ctrl+C, then npm start) so they pick up the change.');
