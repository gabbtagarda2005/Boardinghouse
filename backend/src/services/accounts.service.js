/** Firebase Authentication accounts for admins and tenants (created only by the backend). */
const crypto = require('crypto');
const { auth } = require('../config/firebase');
const { col, C, now } = require('../db');
const { forgetUser } = require('../middleware/auth');
const { USER_STATUS } = require('../constants');

// Easy to read aloud: no 0/O, 1/l/I. 12 random characters in three groups, e.g. "B7mQ-92xK-Lp4Z".
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGIT = '23456789';
const pick = (set) => set[crypto.randomInt(set.length)];

function temporaryPassword() {
  const all = UPPER + LOWER + DIGIT;
  for (;;) {
    const chars = Array.from({ length: 12 }, () => pick(all));
    // Must meet the password rules (upper, lower, number).
    if (chars.some((c) => UPPER.includes(c)) && chars.some((c) => LOWER.includes(c)) && chars.some((c) => DIGIT.includes(c))) {
      return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8).join('')}`;
    }
  }
}

/** When a temporary password stops working (Settings → days, default 3). */
async function tempPasswordExpiry() {
  const { getSettings } = require('./settings.service');
  const days = Number((await getSettings()).tempPasswordDays) || 3;
  return new Date(Date.now() + days * 86400000);
}

/** Creates a login (Firebase Auth) + profile (Firestore). The role is a custom claim. */
/** emailVerified: set only for owner accounts created on purpose, so a later 'Sign in with Google' with the
 *  same Gmail joins this account (same uid and role) and keeps the password sign-in too. */
async function createAccount({ email, password, name, phone, role, mustChangePassword = true, emailVerified = false }) {
  const user = await auth.createUser({ email, password, displayName: name, disabled: false, emailVerified });
  try {
    await auth.setCustomUserClaims(user.uid, { role });
    await col(C.users).doc(user.uid).set({
      uid: user.uid,
      role,
      name,
      email,
      phone: phone || null,
      profilePhoto: null,
      status: USER_STATUS.ACTIVE,
      mustChangePassword,
      tempPasswordExpiresAt: mustChangePassword ? await tempPasswordExpiry() : null,
      fcmTokens: [],
      createdAt: now(),
      updatedAt: now(),
    });
  } catch (err) {
    await auth.deleteUser(user.uid).catch(() => {});
    throw err;
  }
  return user.uid;
}

async function deleteAccount(uid) {
  await auth.deleteUser(uid).catch(() => {});
  await col(C.users).doc(uid).delete().catch(() => {});
}

/** Enables or disables sign-in. Disabling also signs the user out everywhere. */
async function setActive(uid, active) {
  await auth.updateUser(uid, { disabled: !active });
  if (!active) await auth.revokeRefreshTokens(uid);
  await col(C.users).doc(uid).update({ status: active ? USER_STATUS.ACTIVE : USER_STATUS.INACTIVE, updatedAt: now() });
  forgetUser(uid);
}

async function setPassword(uid, password, { mustChange = true } = {}) {
  await auth.updateUser(uid, { password });
  await auth.revokeRefreshTokens(uid);
  // A temporary password must be replaced by the tenant, and stops working after a few days.
  await col(C.users).doc(uid).update({ mustChangePassword: mustChange, tempPasswordExpiresAt: mustChange ? await tempPasswordExpiry() : null, tempPasswordExpired: false, updatedAt: now() });
  forgetUser(uid);
}

async function updateProfile(uid, { name, email, phone }) {
  const authChanges = {};
  if (name !== undefined) authChanges.displayName = name;
  if (email !== undefined) authChanges.email = email;
  if (Object.keys(authChanges).length) await auth.updateUser(uid, authChanges);
  const doc = { updatedAt: now() };
  if (name !== undefined) doc.name = name;
  if (email !== undefined) doc.email = email;
  if (phone !== undefined) doc.phone = phone || null;
  await col(C.users).doc(uid).update(doc);
  forgetUser(uid);
}

/** A temporary password that ran out: replace it with a random secret nobody knows, and sign the user out. */
async function expireTemporaryPassword(uid) {
  await auth.updateUser(uid, { password: crypto.randomBytes(24).toString('base64url') + 'Aa1' });
  await auth.revokeRefreshTokens(uid);
  await col(C.users).doc(uid).update({ tempPasswordExpiresAt: null, tempPasswordExpired: true, updatedAt: now() });
  forgetUser(uid);
}

module.exports = { createAccount, deleteAccount, setActive, setPassword, updateProfile, temporaryPassword, tempPasswordExpiry, expireTemporaryPassword };
