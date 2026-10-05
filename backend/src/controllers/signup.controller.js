/**
 * Tenant self sign-up (with owner approval) and tenant profile photos.
 *
 * Sign-up: the app creates the Firebase login, then calls POST /auth/register. The account starts
 * as PENDING: no role claim, no access to any data. The owner approves or declines it in the admin.
 */
const ApiError = require('../utils/ApiError');
const { col, C, toPlain, now, incrementCounter } = require('../db');
const { auth } = require('../config/firebase');
const { ROLE, USER_STATUS, TENANT_STATUS, SIGNUP_REJECTION_REASONS } = require('../constants');
const { getSettings } = require('../services/settings.service');
const { forgetUser } = require('../middleware/auth');
const { assignTenant } = require('../services/occupancy.service');
const { audit } = require('../services/audit.service');
const { notifyUsers, notifyAdmins, emitToAdmins } = require('../services/notification.service');
const { saveFile, streamFile, deleteFile, newFileName } = require('../services/storage.service');

// ---------------- Sign-up ----------------
async function register(req, res) {
  const { uid, email } = req.firebase;
  if (!email) throw ApiError.badRequest('Please sign up with an email address.');
  const existing = toPlain(await col(C.users).doc(uid).get());
  if (existing) return res.json({ success: true, status: existing.status, role: existing.role });

  const { name, phone, requestedRoom, requestedMoveIn, occupation, address, birthDate, emergencyContact } = req.body;
  const at = now();
  await col(C.users).doc(uid).set({
    uid,
    role: ROLE.TENANT,
    name,
    email: email.toLowerCase(),
    phone: phone || null,
    profilePhoto: null,
    status: USER_STATUS.PENDING,
    mustChangePassword: false,
    selfRegistered: true,
    fcmTokens: [],
    createdAt: at,
    updatedAt: at,
  });
  const seq = await incrementCounter('tenant-code');
  await col(C.tenants).doc(uid).set({
    uid,
    tenantCode: `T-${String(seq).padStart(4, '0')}`,
    name,
    email: email.toLowerCase(),
    phone: phone || null,
    status: TENANT_STATUS.PENDING,
    selfRegistered: true,
    requestedRoom: requestedRoom || null,
    requestedMoveIn: requestedMoveIn || null,
    occupation: occupation || null,
    address: address || null,
    birthDate: birthDate || null,
    emergencyContact: emergencyContact?.name || emergencyContact?.phone ? emergencyContact : null,
    moveInDate: null,
    moveOutDate: null,
    currentAssignmentId: null,
    currentRoomId: null,
    currentRoomNumber: null,
    currentBedNumber: null,
    monthlyRent: null,
    createdAt: at,
    updatedAt: at,
  });
  await auth.updateUser(uid, { displayName: name }).catch(() => {});
  forgetUser(uid);
  const person = { uid, _id: uid, name, role: ROLE.TENANT };
  await audit({ actor: person, req, action: 'tenant.signup', entityType: 'Tenant', entityId: uid, summary: `${name} registered a tenant account`, details: { personName: name } });
  await notifyAdmins({ type: 'tenant_signup', title: 'New Tenant Account', message: `${name} has created a tenant account and is waiting for approval.`, data: { tenantId: uid } }).catch(() => {});
  emitToAdmins('tenant:signup', { tenantId: uid });
  res.status(201).json({ success: true, status: USER_STATUS.PENDING, message: 'Account created. The owner will review it soon.' });
}

/**
 * Where a signed-in Firebase user stands: not registered yet, PENDING, ACTIVE (approved), INACTIVE (suspended)
 * or REJECTED. Only the user's own details plus the house's public contact are returned.
 */
async function status(req, res) {
  const u = toPlain(await col(C.users).doc(req.firebase.uid).get());
  const s = await getSettings();
  res.json({
    success: true,
    registered: Boolean(u),
    status: u?.status || null,
    role: u?.role || null,
    name: u?.name || null,
    email: u?.email || req.firebase.email || null,
    registeredAt: u?.createdAt || null,
    rejectionReason: u?.status === USER_STATUS.REJECTED ? u.rejectionReason || null : null,
    house: { name: s.houseName, phone: s.contactPhone || null, email: s.contactEmail || null },
  });
}

/** A sign-up the owner can still decide on (waiting, or earlier not approved). */
async function pendingTenant(id) {
  const t = toPlain(await col(C.tenants).doc(id).get());
  if (!t) throw ApiError.notFound('Tenant not found');
  if (![TENANT_STATUS.PENDING, TENANT_STATUS.REJECTED].includes(t.status)) throw ApiError.conflict('This account was already approved.');
  return t;
}

async function approve(req, res) {
  const t = await pendingTenant(req.params.id);
  const { roomId, bedNumber, startDate, monthlyRent } = req.body;
  const at = now();
  const before = { status: t.status };
  await col(C.users).doc(t._id).update({ status: USER_STATUS.ACTIVE, approvedAt: at, approvedBy: req.user.uid, rejectionReason: null, updatedAt: at });
  await col(C.tenants).doc(t._id).update({ status: TENANT_STATUS.ACTIVE, approvedAt: at, moveInDate: roomId ? startDate || t.requestedMoveIn || at : t.moveInDate || null, updatedAt: at });
  forgetUser(t._id);
  // A room is assigned only when the owner chooses one now; it can also be done later.
  let a = null;
  if (roomId) {
    try {
      a = await assignTenant({ tenantId: t._id, roomId, bedNumber, startDate: startDate || t.requestedMoveIn || undefined, monthlyRent }, { actor: req.user, req });
    } catch (err) {
      await col(C.users).doc(t._id).update({ status: before.status === TENANT_STATUS.REJECTED ? USER_STATUS.REJECTED : USER_STATUS.PENDING, approvedAt: null, approvedBy: null });
      await col(C.tenants).doc(t._id).update({ status: before.status, approvedAt: null });
      forgetUser(t._id);
      throw err;
    }
  }
  await auth.setCustomUserClaims(t._id, { role: ROLE.TENANT });
  await audit({ actor: req.user, req, action: 'tenant.approve', entityType: 'Tenant', entityId: t._id, summary: `${t.name}'s tenant account was approved`, details: { personName: t.name, tenantId: t._id } });
  await notifyUsers([t._id], { type: 'account_approved', title: 'Account approved', message: 'Your tenant account has been approved. You can now access the Boarding House app.' }).catch(() => {});
  res.json({ success: true, message: a ? `${t.name} was approved and placed in Room ${a.roomNumber}${a.bedNumber ? `, Bed ${a.bedNumber}` : ''}.` : `${t.name}'s account was approved. You can assign a room any time.` });
}

/** Not approved: kept (not deleted), with the reason the applicant sees when they open the app. */
async function reject(req, res) {
  const t = await pendingTenant(req.params.id);
  if (t.status === TENANT_STATUS.REJECTED) throw ApiError.conflict('This account was already not approved.');
  const reason = req.body.reason === 'OTHER' ? req.body.note.trim() : SIGNUP_REJECTION_REASONS[req.body.reason];
  const at = now();
  await col(C.users).doc(t._id).update({ status: USER_STATUS.REJECTED, rejectionReason: reason, rejectedAt: at, updatedAt: at });
  await col(C.tenants).doc(t._id).update({ status: TENANT_STATUS.REJECTED, rejectionReason: reason, rejectedAt: at, updatedAt: at });
  await auth.revokeRefreshTokens(t._id).catch(() => {});
  forgetUser(t._id);
  await audit({ actor: req.user, req, action: 'tenant.reject', entityType: 'Tenant', entityId: t._id, summary: `${t.name}'s tenant account was not approved`, details: { personName: t.name, reason } });
  res.json({ success: true, message: `${t.name}'s account was not approved. They will see this when they open the app.` });
}

// ---------------- Profile photos ----------------
const photoUrl = (u, base) => (u?.profilePhoto?.path ? `${base}?v=${u.profilePhoto.updatedAt || 0}` : null);

async function uploadPhoto(req, res) {
  if (!req.file) throw ApiError.badRequest('Please choose a photo (JPG, PNG or WEBP).');
  const uid = req.user.uid;
  const before = toPlain(await col(C.users).doc(uid).get());
  const path = `profile-images/${uid}/${newFileName(req.file.mimetype)}`;
  await saveFile(path, req.file.buffer, req.file.mimetype, { uid });
  const profilePhoto = { path, contentType: req.file.mimetype, updatedAt: Date.now() };
  await col(C.users).doc(uid).update({ profilePhoto, updatedAt: now() });
  if (before?.profilePhoto?.path) await deleteFile(before.profilePhoto.path);
  forgetUser(uid);
  res.json({ success: true, photoUrl: photoUrl({ profilePhoto }, '/api/v1/me/profile/photo'), message: 'Profile photo saved.' });
}

async function removePhoto(req, res) {
  const uid = req.user.uid;
  const before = toPlain(await col(C.users).doc(uid).get());
  await col(C.users).doc(uid).update({ profilePhoto: null, updatedAt: now() });
  if (before?.profilePhoto?.path) await deleteFile(before.profilePhoto.path);
  forgetUser(uid);
  res.json({ success: true, photoUrl: null, message: 'Profile photo removed.' });
}

async function streamPhotoOf(uid, res) {
  const u = toPlain(await col(C.users).doc(uid).get());
  if (!u?.profilePhoto?.path) throw ApiError.notFound('No profile photo.');
  await streamFile(u.profilePhoto.path, res, { contentType: u.profilePhoto.contentType, cache: 'private, max-age=3600' });
}

/** The signed-in tenant's own photo. */
const myPhoto = (req, res) => streamPhotoOf(req.user.uid, res);
/** Owner: a tenant's photo. */
const tenantPhoto = (req, res) => streamPhotoOf(req.params.id, res);

module.exports = { register, status, approve, reject, uploadPhoto, removePhoto, myPhoto, tenantPhoto, photoUrl };
