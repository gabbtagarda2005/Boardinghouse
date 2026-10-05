const env = require('../config/env');
const { auth, appCheck } = require('../config/firebase');
const { col, C, toPlain } = require('../db');
const ApiError = require('../utils/ApiError');
const { ROLE, USER_STATUS } = require('../constants');

// Short cache of user profiles: avoids one Firestore read per API call (cost-aware).
const cache = new Map();
const TTL = 30000;

function forgetUser(uid) {
  cache.delete(uid);
}

async function loadProfile(uid) {
  const hit = cache.get(uid);
  if (hit && Date.now() - hit.at < TTL) return hit.user;
  const user = toPlain(await col(C.users).doc(uid).get());
  cache.set(uid, { user, at: Date.now() });
  return user;
}

/**
 * Verifies a Firebase ID token and returns the signed-in user.
 * The role comes from the token's custom claim (set only by the backend).
 */
async function verifyToken(token) {
  if (!token) throw ApiError.unauthorized();
  try {
    return await auth.verifyIdToken(token);
  } catch (err) {
    const e = ApiError.unauthorized(err.code === 'auth/id-token-expired' ? 'Your session expired. Please sign in again.' : 'Please sign in again.');
    e.code = err.code === 'auth/id-token-expired' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    throw e;
  }
}

const blocked = (message, code) => {
  const e = ApiError.forbidden(message);
  e.code = code;
  return e;
};

async function resolveUser(token) {
  const decoded = await verifyToken(token);
  const profile = await loadProfile(decoded.uid);
  if (profile?.status === USER_STATUS.PENDING) throw blocked('Your account is waiting for the owner\'s approval.', 'PENDING_APPROVAL');
  if (profile?.status === USER_STATUS.REJECTED) throw blocked('Your account is currently not approved.', 'ACCOUNT_REJECTED');
  if (profile?.status === USER_STATUS.INACTIVE) throw blocked('Your account has been temporarily suspended. Please contact the boarding house.', 'ACCOUNT_SUSPENDED');
  if (!profile || profile.status !== USER_STATUS.ACTIVE) {
    throw ApiError.unauthorized('This account is not active. Please contact the boarding house owner.');
  }
  // A temporary password that ran out stops working for good: the owner has to give a new one.
  const expires = profile.mustChangePassword && profile.tempPasswordExpiresAt ? new Date(profile.tempPasswordExpiresAt) : null;
  if (expires && expires < new Date()) {
    await require('../services/accounts.service').expireTemporaryPassword(decoded.uid).catch(() => {});
    throw blocked('Your temporary password has expired. Please ask the boarding house owner for a new one.', 'TEMP_PASSWORD_EXPIRED');
  }
  const role = decoded.role || profile.role;
  return { ...profile, uid: decoded.uid, _id: decoded.uid, role };
}

/** Signed in with Firebase, but may not have an account record yet (used for sign-up). */
async function authenticateToken(req, _res, next) {
  const header = req.headers.authorization || '';
  req.firebase = await verifyToken(header.startsWith('Bearer ') ? header.slice(7) : null);
  next();
}

async function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  req.user = await resolveUser(header.startsWith('Bearer ') ? header.slice(7) : null);
  next();
}

function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    return next();
  };
}

const adminOnly = authorize(ROLE.ADMIN);
const tenantOnly = authorize(ROLE.TENANT);

/** Optional Firebase App Check: rejects requests not coming from your registered apps. */
async function requireAppCheck(req, _res, next) {
  if (!env.firebase.enforceAppCheck) return next();
  const token = req.get('X-Firebase-AppCheck');
  if (!token) return next(ApiError.unauthorized('Please update the app and try again.'));
  try {
    await appCheck().verifyToken(token);
    return next();
  } catch {
    return next(ApiError.unauthorized('Please update the app and try again.'));
  }
}

module.exports = { authenticate, authenticateToken, authorize, adminOnly, tenantOnly, resolveUser, requireAppCheck, forgetUser };
