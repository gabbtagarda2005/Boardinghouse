/**
 * Creates an owner/administrator login (no sample data). Use this for a real Firebase project.
 *   npm run create-admin -- --email owner@example.com --name "Owner Name" --password "Your-pass1"
 * Leave out --password to get a random one (e.g. for an owner who signs in with Google).
 */
const crypto = require('crypto');
const accounts = require('../services/accounts.service');
const { ROLE } = require('../constants');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

(async () => {
  const email = (arg('email') || '').trim().toLowerCase();
  const name = arg('name') || 'Administrator';
  const given = arg('password');
  const password = given || `Owner-${crypto.randomBytes(6).toString('hex')}7`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please provide --email');
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) throw new Error('Please provide --password with at least 8 characters, including a letter and a number');
  await accounts.createAccount({ email, password, name, role: ROLE.ADMIN, mustChangePassword: !given, emailVerified: true });
  console.log(`[create-admin] ${email} can now sign in to the admin web app (with Google, or with a password).`);
  if (!given) console.log(`[create-admin] Temporary password: ${password}  (change it after signing in)`);
  process.exit(0);
})().catch((err) => {
  console.error('[create-admin]', err.code === 'auth/email-already-exists' ? 'An account with this email already exists.' : err.message);
  process.exit(1);
});
