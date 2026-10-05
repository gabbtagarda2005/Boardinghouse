/**
 * Tenant self-service. Every query uses the signed-in tenant's own id (from the verified
 * Firebase token), so a tenant can never see another tenant's records.
 */
const { col, C, toPlain, listOf, now } = require('../db');
const ApiError = require('../utils/ApiError');
const { getPagination, paged } = require('../utils/pagination');
const { sum } = require('../utils/money');
const { periodLabel } = require('../utils/dates');
const { withLivePreviousBalance } = require('../services/billing.service');
const payments = require('../services/payment.service');
const accounts = require('../services/accounts.service');
const { getSettings, logoUrl } = require('../services/settings.service');
const { photoUrl } = require('./signup.controller');
const { manilaNow } = require('../services/dashboard.service');
const { presentRoom } = require('./room.controller');
const { sendStatement, sendReceipt, sendProof } = require('./billing.controllers');
const { BILL_STATE, ASSIGNMENT_STATUS, PAYMENT_STATUS } = require('../constants');

async function myTenant(req) {
  const t = toPlain(await col(C.tenants).doc(req.user.uid).get());
  if (!t) throw ApiError.notFound('Your tenant profile was not found. Please contact the boarding house owner.');
  return t;
}

const visible = (b) => b.state === BILL_STATE.PUBLISHED || b.state === BILL_STATE.VOID;
const myBills = async (uid) => listOf(await col(C.bills).where('tenantId', '==', uid).get()).filter(visible).sort((a, b) => b.billingYear - a.billingYear || b.billingMonth - a.billingMonth);

async function ownBill(req) {
  const b = toPlain(await col(C.bills).doc(req.params.id).get());
  if (!b || b.tenantId !== req.user.uid || !visible(b)) throw ApiError.notFound('Bill not found');
  return b;
}
async function ownPayment(req) {
  const p = toPlain(await col(C.payments).doc(req.params.id).get());
  if (!p || p.tenantId !== req.user.uid) throw ApiError.notFound('Payment not found');
  return p;
}

async function home(req, res) {
  const tenant = await myTenant(req);
  const { year, month } = manilaNow();
  const [bills, notifications, unread, pending] = await Promise.all([
    myBills(tenant._id),
    col(C.notifications).where('userId', '==', tenant._id).orderBy('createdAt', 'desc').limit(5).get().then(listOf),
    col(C.notifications).where('userId', '==', tenant._id).where('readAt', '==', null).count().get(),
    col(C.payments).where('tenantId', '==', tenant._id).where('status', '==', PAYMENT_STATUS.PENDING).count().get(),
  ]);
  const sent = bills.filter((b) => b.state === BILL_STATE.PUBLISHED);
  const current = sent.find((b) => b.billingYear === year && b.billingMonth === month) || sent[0] || null;
  const unpaid = sent.filter((b) => b.remainingBalance > 0).sort((a, b) => a.dueDate - b.dueDate);
  res.json({
    success: true,
    tenant: { name: tenant.name, tenantCode: tenant.tenantCode, status: tenant.status },
    house: await getSettings().then((st) => ({ name: st.houseName, logoUrl: logoUrl(st) })),
    room: tenant.currentRoomId ? { _id: tenant.currentRoomId, roomNumber: tenant.currentRoomNumber, bedNumber: tenant.currentBedNumber } : null,
    currentPeriod: { year, month, label: periodLabel(year, month) },
    currentBill: current ? await withLivePreviousBalance(current) : null,
    outstandingBalance: sum(unpaid.map((b) => b.remainingBalance)),
    nextDue: unpaid[0] ? { billId: unpaid[0]._id, dueDate: unpaid[0].dueDate, remainingBalance: unpaid[0].remainingBalance, label: periodLabel(unpaid[0].billingYear, unpaid[0].billingMonth), status: unpaid[0].status } : null,
    pendingPayments: pending.data().count,
    notifications,
    unreadNotifications: unread.data().count,
    mustChangePassword: Boolean(req.user.mustChangePassword),
  });
}

async function myRoom(req, res) {
  const tenant = await myTenant(req);
  if (!tenant.currentRoomId) return res.json({ success: true, room: null });
  const room = toPlain(await col(C.rooms).doc(tenant.currentRoomId).get());
  const mates = listOf(await col(C.roomAssignments).where('roomId', '==', room._id).where('status', '==', ASSIGNMENT_STATUS.ACTIVE).get()).filter((a) => a.tenantId !== tenant._id);
  const r = presentRoom(room);
  return res.json({
    success: true,
    room: { _id: r._id, roomNumber: r.roomNumber, name: r.name, building: r.building, capacity: r.capacity, occupiedBeds: r.occupiedBeds, availableBeds: r.availableBeds, amenities: r.amenities || [], description: r.description, photos: r.photos, status: r.status },
    assignment: { bedNumber: tenant.currentBedNumber, monthlyRent: tenant.monthlyRent, startDate: tenant.moveInDate },
    roommates: mates.map((m) => ({ bedNumber: m.bedNumber, firstName: (m.tenantName || '').split(' ')[0] })),
  });
}

async function bills(req, res) {
  const all = await myBills(req.user.uid);
  const pg = getPagination(req.query, { defaultLimit: 24, maxLimit: 100 });
  const outstanding = sum(all.filter((b) => b.state === BILL_STATE.PUBLISHED && b.remainingBalance > 0).map((b) => b.remainingBalance));
  res.json({ success: true, ...paged(await withLivePreviousBalance(all.slice(pg.skip, pg.skip + pg.limit)), all.length, pg), outstandingBalance: outstanding });
}

async function bill(req, res) {
  const b = await ownBill(req);
  const list = listOf(await col(C.payments).where('tenantId', '==', req.user.uid).get()).filter((p) => p.billId === b._id || p.allocations?.some((a) => a.billId === b._id));
  res.json({ success: true, bill: await withLivePreviousBalance(b), payments: list.sort((a, c) => c.submittedAt - a.submittedAt).map(payments.presentPayment) });
}

async function billStatement(req, res) {
  const b = await ownBill(req);
  if (b.state !== BILL_STATE.PUBLISHED) throw ApiError.badRequest('This bill was cancelled.');
  await sendStatement(b, res);
}

async function paymentList(req, res) {
  let list = listOf(await col(C.payments).where('tenantId', '==', req.user.uid).get());
  if (req.query.status) list = list.filter((p) => p.status === req.query.status);
  list.sort((a, b) => b.submittedAt - a.submittedAt);
  const pg = getPagination(req.query, { defaultLimit: 30, maxLimit: 100 });
  res.json({ success: true, ...paged(list.slice(pg.skip, pg.skip + pg.limit).map(payments.presentPayment), list.length, pg) });
}

async function payment(req, res) {
  res.json({ success: true, payment: payments.presentPayment(await ownPayment(req)) });
}

async function submitPayment(req, res) {
  const tenant = await myTenant(req);
  const p = await payments.submitClaim(tenant, req.body, req.file, { req });
  res.status(201).json({ success: true, payment: p, message: 'Payment submitted successfully. It will show as paid once the owner verifies it.' });
}

async function paymentInfo(req, res) {
  const settings = await getSettings();
  const unpaid = (await myBills(req.user.uid)).filter((b) => b.state === BILL_STATE.PUBLISHED && b.remainingBalance > 0).sort((a, b) => a.dueDate - b.dueDate);
  res.json({
    success: true,
    instructions: settings.paymentInstructions,
    channels: settings.paymentChannels,
    unpaidBills: unpaid.map((b) => ({ _id: b._id, billNumber: b.billNumber, label: periodLabel(b.billingYear, b.billingMonth), remainingBalance: b.remainingBalance, dueDate: b.dueDate, status: b.status })),
    outstandingBalance: sum(unpaid.map((b) => b.remainingBalance)),
  });
}

async function announcementList(req, res) {
  const tenant = await myTenant(req);
  const all = listOf(await col(C.announcements).orderBy('createdAt', 'desc').limit(60).get());
  const mine = all.filter((a) => a.audience === 'ALL' || (a.recipientIds || []).includes(tenant._id) || (a.roomIds || []).includes(tenant.currentRoomId));
  res.json({ success: true, items: mine.sort((a, b) => Number(b.pinned) - Number(a.pinned)).map(({ recipientIds, roomIds, createdBy, ...a }) => a) });
}

async function profile(req, res) {
  const tenant = await myTenant(req);
  res.json({
    success: true,
    user: { name: tenant.name, email: tenant.email, phone: tenant.phone, photoUrl: photoUrl(req.user, '/api/v1/me/profile/photo') },
    profile: { tenantCode: tenant.tenantCode, address: tenant.address, occupation: tenant.occupation, emergencyContact: tenant.emergencyContact, moveInDate: tenant.moveInDate, status: tenant.status },
  });
}

async function updateProfile(req, res) {
  const { phone, ...rest } = req.body;
  if (phone !== undefined) await accounts.updateProfile(req.user.uid, { phone });
  await col(C.tenants).doc(req.user.uid).update({ ...rest, ...(phone !== undefined ? { phone: phone || null } : {}), updatedAt: now() });
  return profile(req, res);
}

module.exports = {
  home,
  myRoom,
  bills,
  bill,
  billStatement,
  payments: paymentList,
  payment,
  submitPayment,
  paymentProof: async (req, res) => sendProof(await ownPayment(req), res),
  paymentReceipt: async (req, res) => sendReceipt(await ownPayment(req), res),
  paymentInfo,
  announcements: announcementList,
  profile,
  updateProfile,
};
