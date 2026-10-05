const { col, C, toPlain, now } = require('../db');
const { FieldValue } = require('../config/firebase');
const { forgetUser } = require('../middleware/auth');
const { audit } = require('../services/audit.service');
const { ROLE } = require('../constants');

/** The signed-in user's profile (and tenant record). Sign-in itself happens in the apps with Firebase Authentication. */
async function me(req, res) {
  if (req.query.login === '1') await col(C.users).doc(req.user.uid).update({ lastLoginAt: now() });
  const { fcmTokens, ...user } = req.user;
  const out = { user };
  if (req.user.role === ROLE.TENANT) out.tenant = toPlain(await col(C.tenants).doc(req.user.uid).get());
  res.json({ success: true, ...out });
}

/** Called by the apps after the user changed their password with Firebase Authentication. */
async function passwordChanged(req, res) {
  await col(C.users).doc(req.user.uid).update({ mustChangePassword: false, tempPasswordExpiresAt: null, tempPasswordExpired: false, updatedAt: now() });
  forgetUser(req.user.uid);
  await audit({ actor: req.user, req, action: 'auth.password_changed', entityType: 'User', entityId: req.user.uid, summary: 'Password changed', details: { personName: req.user.name } });
  res.json({ success: true });
}

async function registerDevice(req, res) {
  const ref = col(C.users).doc(req.user.uid);
  await ref.update({ fcmTokens: FieldValue.arrayUnion(req.body.token) });
  const tokens = (await ref.get()).data().fcmTokens || [];
  if (tokens.length > 5) await ref.update({ fcmTokens: tokens.slice(-5) });
  res.json({ success: true });
}

async function unregisterDevice(req, res) {
  await col(C.users).doc(req.user.uid).update({ fcmTokens: FieldValue.arrayRemove(req.body.token) });
  res.json({ success: true });
}

module.exports = { me, passwordChanged, registerDevice, unregisterDevice };
