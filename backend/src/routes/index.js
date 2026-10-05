const { Router } = require('express');
const { z } = require('zod');
const { authenticate, authenticateToken, adminOnly, tenantOnly } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { roomPhotoUpload, proofUpload, logoUpload, coverUpload, photoUpload, verifyFileSignature } = require('../middleware/upload');
const s = require('../validators/schemas');

const authC = require('../controllers/auth.controller');
const rooms = require('../controllers/room.controller');
const tenants = require('../controllers/tenant.controller');
const { elec, bills, pays } = require('../controllers/billing.controllers');
const misc = require('../controllers/misc.controllers');
const me = require('../controllers/me.controller');
const branding = require('../controllers/branding.controller');
const signup = require('../controllers/signup.controller');
const inquiries = require('../controllers/inquiry.controller');

const router = Router();
const id = { params: s.idParam };
const admin = [authenticate, adminOnly];
const tenant = [authenticate, tenantOnly];

router.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Public: room photos (not sensitive; used directly in <img> tags).
// Public: the boarding house logo and name, shown on the sign-in screens of both apps.
router.get('/files/branding/logo', branding.logoFile);
router.get('/public/branding', branding.publicBranding);
// Public boarding-house page (/inquire): house info, rooms and live availability. No tenant data.
router.get('/public/house', branding.publicHouse);
router.get('/public/rooms', rooms.publicList);
router.get('/public/rooms/:id', validate(id), rooms.publicOne);
router.get('/files/branding/cover', branding.coverFile);
router.get('/public/app-info', inquiries.appInfo);
// Public: people looking for a room can send an inquiry (no account).
router.post('/public/inquiries', validate({ body: s.inquiries.create }), inquiries.create);

router.get('/files/rooms/:id/:photoId', validate({ params: z.object({ id: s.id, photoId: z.string().regex(/^[a-f0-9]{16}$/) }) }), rooms.photo);

// ---------- Signed-in user (sign-in itself happens with Firebase Authentication) ----------
router.get('/auth/me', authenticate, authC.me);
// Tenant self sign-up (the account waits for the owner's approval).
router.post('/auth/register', authenticateToken, validate({ body: s.auth.register }), signup.register);
router.get('/auth/status', authenticateToken, signup.status);
router.post('/auth/password-changed', authenticate, authC.passwordChanged);
router.post('/auth/devices', authenticate, validate({ body: s.auth.device }), authC.registerDevice);
router.delete('/auth/devices', authenticate, validate({ body: s.auth.device }), authC.unregisterDevice);

// ---------- Owner ----------
router.get('/dashboard', ...admin, misc.dashboard);

router.get('/rooms', ...admin, validate({ query: s.rooms.list }), rooms.list);
router.post('/rooms', ...admin, validate({ body: s.rooms.create }), rooms.create);
router.get('/rooms/:id', ...admin, validate(id), rooms.get);
router.patch('/rooms/:id', ...admin, validate({ ...id, body: s.rooms.update }), rooms.update);
router.post('/rooms/:id/archive', ...admin, validate(id), rooms.archive);
router.post('/rooms/:id/restore', ...admin, validate(id), rooms.restore);
router.post('/rooms/:id/photos', ...admin, validate(id), roomPhotoUpload.array('photos', 6), verifyFileSignature, rooms.addPhotos);
router.delete('/rooms/:id/photos/:photoId', ...admin, validate({ params: z.object({ id: s.id, photoId: z.string().max(40) }) }), rooms.removePhoto);

router.get('/tenants', ...admin, validate({ query: s.tenants.list }), tenants.list);
router.post('/tenants', ...admin, validate({ body: s.tenants.create }), tenants.create);
router.get('/tenants/:id', ...admin, validate(id), tenants.get);
router.patch('/tenants/:id', ...admin, validate({ ...id, body: s.tenants.update }), tenants.update);
router.post('/tenants/:id/assign', ...admin, validate({ ...id, body: s.tenants.assign }), tenants.assign);
router.post('/tenants/:id/transfer', ...admin, validate({ ...id, body: s.tenants.transfer }), tenants.transfer);
router.post('/tenants/:id/move-out', ...admin, validate({ ...id, body: s.tenants.moveOut }), tenants.moveOut);
router.post('/tenants/:id/deactivate', ...admin, validate({ ...id, body: s.tenants.deactivate }), tenants.deactivate);
router.post('/tenants/:id/reactivate', ...admin, validate(id), tenants.reactivate);
router.post('/tenants/:id/approve', ...admin, validate({ ...id, body: s.tenants.approve }), signup.approve);
router.post('/tenants/:id/reject', ...admin, validate({ ...id, body: s.tenants.reject }), signup.reject);
router.get('/tenants/:id/photo', ...admin, validate(id), signup.tenantPhoto);
router.post('/tenants/:id/reset-password', ...admin, validate({ ...id, body: s.tenants.resetPassword }), tenants.resetPassword);

router.get('/electricity', ...admin, validate({ query: s.electricity.list }), elec.list);
router.get('/electricity/occupants', ...admin, validate({ query: s.electricity.occupants }), elec.occupants);
router.post('/electricity/preview', ...admin, validate({ body: s.electricity.preview }), elec.preview);
router.post('/electricity', ...admin, validate({ body: s.electricity.create }), elec.create);
router.patch('/electricity/:id', ...admin, validate({ ...id, body: s.electricity.update }), elec.update);
router.delete('/electricity/:id', ...admin, validate(id), elec.remove);

router.get('/bills', ...admin, validate({ query: s.bills.list }), bills.list);
router.get('/bills/summary', ...admin, validate({ query: s.bills.list }), bills.summary);
router.post('/bills/generate', ...admin, validate({ body: s.bills.generate }), bills.generate);
router.post('/bills/publish', ...admin, validate({ body: s.bills.publish }), bills.publish);
router.get('/bills/:id', ...admin, validate(id), bills.get);
router.patch('/bills/:id', ...admin, validate({ ...id, body: s.bills.updateDraft }), bills.updateDraft);
router.post('/bills/:id/adjustments', ...admin, validate({ ...id, body: s.bills.adjust }), bills.adjust);
router.post('/bills/:id/void', ...admin, validate({ ...id, body: s.bills.void }), bills.voidBill);
router.post('/bills/:id/remind', ...admin, validate({ ...id, body: z.object({ message: z.string().max(500).optional() }) }), bills.remind);
router.get('/bills/:id/statement.pdf', ...admin, validate(id), bills.statement);

router.get('/payments', ...admin, validate({ query: s.payments.list }), pays.list);
router.post('/payments', ...admin, validate({ body: s.payments.record }), pays.record);
router.get('/payments/:id', ...admin, validate(id), pays.get);
router.post('/payments/:id/confirm', ...admin, validate({ ...id, body: s.payments.confirm }), pays.confirm);
router.post('/payments/:id/reject', ...admin, validate({ ...id, body: s.payments.reject }), pays.reject);
router.post('/payments/:id/reverse', ...admin, validate({ ...id, body: s.payments.reverse }), pays.reverse);
router.get('/payments/:id/proof', ...admin, validate(id), pays.proof);
router.get('/payments/:id/receipt.pdf', ...admin, validate(id), pays.receipt);

router.get('/inquiries/new-count', ...admin, inquiries.newCount);
router.get('/inquiries', ...admin, validate({ query: s.inquiries.list }), inquiries.list);
router.patch('/inquiries/:id', ...admin, validate({ ...id, body: s.inquiries.update }), inquiries.update);
router.delete('/inquiries/:id', ...admin, validate(id), inquiries.remove);

router.get('/announcements', ...admin, validate({ query: s.listQuery }), misc.announcements.list);
router.post('/announcements', ...admin, validate({ body: s.announcements.create }), misc.announcements.create);
router.post('/announcements/:id/pin', ...admin, validate(id), misc.announcements.togglePin);
router.delete('/announcements/:id', ...admin, validate(id), misc.announcements.remove);

router.get('/reports/:type', ...admin, validate({ query: s.reports.query }), misc.report);
router.get('/settings', ...admin, misc.settings.get);
router.patch('/settings', ...admin, validate({ body: s.settings.update }), misc.settings.update);
router.post('/settings/logo', ...admin, logoUpload.single('logo'), verifyFileSignature, branding.uploadLogo);
router.delete('/settings/logo', ...admin, branding.removeLogo);
router.post('/settings/cover', ...admin, coverUpload.single('cover'), verifyFileSignature, branding.uploadCover);
router.delete('/settings/cover', ...admin, branding.removeCover);
router.get('/activity', ...admin, validate({ query: s.activity.list }), misc.activity);
router.post('/notifications/run-reminders', ...admin, misc.notifications.runReminders);

router.patch('/users/me', authenticate, validate({ body: s.users.updateMe }), misc.users.updateMe);
router.get('/users/admins', ...admin, misc.users.listAdmins);
router.post('/users/admins', ...admin, validate({ body: s.users.createAdmin }), misc.users.createAdmin);
router.patch('/users/admins/:id', ...admin, validate({ ...id, body: z.object({ isActive: z.boolean() }) }), misc.users.setActive);

// ---------- Notifications: everyone sees only their own ----------
router.get('/notifications', authenticate, validate({ query: s.notifications.list }), misc.notifications.listMine);
router.post('/notifications/read-all', authenticate, misc.notifications.markAllRead);
router.delete('/notifications', authenticate, misc.notifications.clearMine);
router.post('/notifications/:id/read', authenticate, validate(id), misc.notifications.markRead);
router.delete('/notifications/:id', authenticate, validate(id), misc.notifications.remove);

// ---------- Tenant ----------
router.get('/me/home', ...tenant, me.home);
router.get('/me/room', ...tenant, me.myRoom);
router.get('/me/bills', ...tenant, me.bills);
router.get('/me/bills/:id', ...tenant, validate(id), me.bill);
router.get('/me/bills/:id/statement.pdf', ...tenant, validate(id), me.billStatement);
router.get('/me/payment-info', ...tenant, me.paymentInfo);
router.get('/me/payments', ...tenant, me.payments);
router.post('/me/payments', ...tenant, proofUpload.single('proof'), verifyFileSignature, validate({ body: s.payments.submit }), me.submitPayment);
router.get('/me/payments/:id', ...tenant, validate(id), me.payment);
router.get('/me/payments/:id/proof', ...tenant, validate(id), me.paymentProof);
router.get('/me/payments/:id/receipt.pdf', ...tenant, validate(id), me.paymentReceipt);
router.get('/me/announcements', ...tenant, me.announcements);
router.get('/me/profile', ...tenant, me.profile);
router.get('/me/profile/photo', ...tenant, signup.myPhoto);
router.post('/me/profile/photo', ...tenant, photoUpload.single('photo'), verifyFileSignature, signup.uploadPhoto);
router.delete('/me/profile/photo', ...tenant, signup.removePhoto);
router.patch('/me/profile', ...tenant, validate({ body: s.users.tenantSelfUpdate }), me.updateProfile);

module.exports = router;
