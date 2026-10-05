const { col, C, toPlain, listOf, now, incrementCounter } = require('../db');
const ApiError = require('../utils/ApiError');
const { sum } = require('../utils/money');
const { audit } = require('../services/audit.service');
const { assignTenant, transferTenant, endTenancy } = require('../services/occupancy.service');
const accounts = require('../services/accounts.service');
const { sendMail, isConfigured: mailConfigured } = require('../services/mail.service');
const { getSettings } = require('../services/settings.service');
const { presentPayment } = require('../services/payment.service');
const { ROLE, TENANT_STATUS, BILL_STATE, BILL_STATUS, PAYMENT_STATUS } = require('../constants');

/** Current balance, next due date and an overall payment status for each tenant. */
function moneySummary(bills, payments = []) {
  const unpaid = bills.filter((b) => b.state === BILL_STATE.PUBLISHED && b.remainingBalance > 0).sort((a, b) => a.dueDate - b.dueDate);
  const balance = sum(unpaid.map((b) => b.remainingBalance));
  // Most urgent first: waiting for the owner's check, then overdue, then unpaid.
  let paymentStatus = 'UP_TO_DATE';
  if (payments.some((p) => p.status === PAYMENT_STATUS.PENDING)) paymentStatus = 'WAITING_FOR_VERIFICATION';
  else if (unpaid.some((b) => b.status === BILL_STATUS.OVERDUE || b.dueDate < new Date())) paymentStatus = 'OVERDUE';
  else if (unpaid.length) paymentStatus = 'UNPAID';
  return { balance, nextDueDate: unpaid[0]?.dueDate || null, paymentStatus, overdueBills: unpaid.filter((b) => b.dueDate < new Date()).length };
}

async function list(req, res) {
  const q = req.valid.query;
  let tenants = listOf(await col(C.tenants).get());
  const status = q.status || 'ACTIVE';
  // Sign-ups waiting for approval (or not approved) are listed only when asked for.
  tenants = status === 'ALL' ? tenants.filter((t) => !['PENDING', 'REJECTED'].includes(t.status)) : tenants.filter((t) => t.status === status);
  if (q.roomId) tenants = tenants.filter((t) => t.currentRoomId === q.roomId);
  if (q.unassigned === 'true') tenants = tenants.filter((t) => !t.currentAssignmentId);
  if (q.search) {
    const s = q.search.toLowerCase().replace(/^room\s*/, '');
    tenants = tenants.filter((t) => [t.name, t.email, t.phone, t.currentRoomNumber, t.tenantCode].some((v) => v && String(v).toLowerCase().includes(s)));
  }
  tenants.sort((a, b) => a.name.localeCompare(b.name));
  const [unpaidBills, pendingPayments] = await Promise.all([
    col(C.bills).where('remainingBalance', '>', 0).get().then(listOf),
    col(C.payments).where('status', '==', PAYMENT_STATUS.PENDING).get().then(listOf),
  ]);
  const items = tenants.map((t) => ({
    ...t,
    ...moneySummary(
      unpaidBills.filter((b) => b.tenantId === t._id),
      pendingPayments.filter((p) => p.tenantId === t._id)
    ),
  }));
  res.json({ success: true, items, total: items.length, page: 1, pages: 1 });
}

async function get(req, res) {
  const tenant = toPlain(await col(C.tenants).doc(req.params.id).get());
  if (!tenant) throw ApiError.notFound('Tenant not found');
  const [user, assignments, bills, payments] = await Promise.all([
    col(C.users).doc(tenant._id).get().then(toPlain),
    col(C.roomAssignments).where('tenantId', '==', tenant._id).get().then(listOf),
    col(C.bills).where('tenantId', '==', tenant._id).get().then(listOf),
    col(C.payments).where('tenantId', '==', tenant._id).get().then(listOf),
  ]);
  const visibleBills = bills.filter((b) => b.state !== BILL_STATE.DRAFT).sort((a, b) => b.billingYear - a.billingYear || b.billingMonth - a.billingMonth);
  res.json({
    success: true,
    tenant: { ...tenant, accountActive: user?.status === 'ACTIVE', mustChangePassword: Boolean(user?.mustChangePassword), lastLoginAt: user?.lastLoginAt || null },
    // Account information for the owner. Passwords are never stored or sent; only whether a temporary one is pending.
    account: {
      email: user?.email || tenant.email,
      status: user?.status || null,
      registeredAt: user?.createdAt || tenant.createdAt || null,
      selfRegistered: Boolean(user?.selfRegistered || tenant.selfRegistered),
      approvedAt: user?.approvedAt || null,
      rejectionReason: user?.rejectionReason || null,
      temporaryPasswordPending: Boolean(user?.mustChangePassword),
      temporaryPasswordExpiresAt: user?.mustChangePassword ? user?.tempPasswordExpiresAt || null : null,
      temporaryPasswordExpired: Boolean(user?.tempPasswordExpired),
    },
    assignments: assignments.sort((a, b) => b.startDate - a.startDate),
    bills: visibleBills,
    payments: payments.sort((a, b) => b.submittedAt - a.submittedAt).map(presentPayment),
    summary: moneySummary(visibleBills, payments),
  });
}

async function create(req, res) {
  const { name, email, phone, password, roomId, bedNumber, monthlyRent, moveInDate, ...profile } = req.body;
  const generated = password ? null : accounts.temporaryPassword();
  const uid = await accounts.createAccount({ email, password: password || generated, name, phone, role: ROLE.TENANT });
  try {
    const seq = await incrementCounter('tenant-code');
    await col(C.tenants).doc(uid).set({
      ...profile,
      birthDate: profile.birthDate || null,
      uid,
      tenantCode: `T-${String(seq).padStart(4, '0')}`,
      name,
      email,
      phone: phone || null,
      status: TENANT_STATUS.ACTIVE,
      moveInDate: moveInDate || null,
      moveOutDate: null,
      currentAssignmentId: null,
      currentRoomId: null,
      currentRoomNumber: null,
      currentBedNumber: null,
      monthlyRent: null,
      createdAt: now(),
      updatedAt: now(),
    });
    let roomNumber;
    if (roomId) {
      const a = await assignTenant({ tenantId: uid, roomId, bedNumber, startDate: moveInDate, monthlyRent }, { actor: req.user, req });
      roomNumber = a.roomNumber;
    }
    await audit({ actor: req.user, req, action: 'tenant.create', entityType: 'Tenant', entityId: uid, summary: `Added tenant ${name}`, details: { personName: name, roomNumber, tenantId: uid } });
  } catch (err) {
    await col(C.tenants).doc(uid).delete().catch(() => {});
    await accounts.deleteAccount(uid);
    throw err;
  }

  let emailed = false;
  const settings = await getSettings();
  if (mailConfigured() && settings.notifications?.emailNewTenants !== false) {
    emailed = (
      await sendMail({
        to: email,
        subject: `Your ${settings.houseName} account`,
        text: `Hello ${name},\n\nAn account was created for you in the ${settings.houseName} tenant app.\n\nEmail: ${email}\n${generated ? `Temporary password: ${generated}\n` : ''}\nYou will be asked to choose your own password when you first sign in.`,
      })
    ).delivered;
  }
  const tenant = toPlain(await col(C.tenants).doc(uid).get());
  res.status(201).json({ success: true, tenant, temporaryPassword: generated || undefined, credentialsEmailed: emailed });
}

async function update(req, res) {
  const tenant = toPlain(await col(C.tenants).doc(req.params.id).get());
  if (!tenant) throw ApiError.notFound('Tenant not found');
  const { name, email, phone, ...profile } = req.body;
  if (name !== undefined || email !== undefined || phone !== undefined) await accounts.updateProfile(tenant._id, { name, email, phone });
  const next = { ...profile, updatedAt: now() };
  if (name !== undefined) next.name = name;
  if (email !== undefined) next.email = email;
  if (phone !== undefined) next.phone = phone || null;
  await col(C.tenants).doc(tenant._id).update(next);
  if (name !== undefined && name !== tenant.name && tenant.currentAssignmentId) {
    await col(C.roomAssignments).doc(tenant.currentAssignmentId).update({ tenantName: name });
  }
  await audit({ actor: req.user, req, action: 'tenant.update', entityType: 'Tenant', entityId: tenant._id, summary: `Updated ${tenant.name}`, details: { personName: name || tenant.name, tenantId: tenant._id }, before: tenant, after: next });
  res.json({ success: true, tenant: toPlain(await col(C.tenants).doc(tenant._id).get()) });
}

async function assign(req, res) {
  res.status(201).json({ success: true, assignment: await assignTenant({ tenantId: req.params.id, ...req.body }, { actor: req.user, req }) });
}

async function transfer(req, res) {
  res.json({ success: true, assignment: await transferTenant({ tenantId: req.params.id, ...req.body }, { actor: req.user, req }) });
}

async function moveOut(req, res) {
  res.json({ success: true, tenant: await endTenancy({ tenantId: req.params.id, date: req.body.date, reason: req.body.reason }, { actor: req.user, req }) });
}

async function deactivate(req, res) {
  const tenant = await endTenancy({ tenantId: req.params.id, reason: req.body.reason, deactivate: true }, { actor: req.user, req });
  await accounts.setActive(req.params.id, false);
  res.json({ success: true, tenant });
}

async function reactivate(req, res) {
  const tenant = toPlain(await col(C.tenants).doc(req.params.id).get());
  if (!tenant) throw ApiError.notFound('Tenant not found');
  await accounts.setActive(tenant._id, true);
  if (tenant.status === TENANT_STATUS.INACTIVE) await col(C.tenants).doc(tenant._id).update({ status: TENANT_STATUS.MOVED_OUT, updatedAt: now() });
  await audit({ actor: req.user, req, action: 'tenant.reactivate', entityType: 'Tenant', entityId: tenant._id, summary: `Restored ${tenant.name}`, details: { personName: tenant.name, tenantId: tenant._id } });
  res.json({ success: true });
}

async function resetPassword(req, res) {
  const tenant = toPlain(await col(C.tenants).doc(req.params.id).get());
  if (!tenant) throw ApiError.notFound('Tenant not found');
  const generated = req.body.newPassword ? null : accounts.temporaryPassword();
  await accounts.setPassword(tenant._id, req.body.newPassword || generated);
  await audit({ actor: req.user, req, action: 'tenant.reset_password', entityType: 'Tenant', entityId: tenant._id, summary: `Reset password for ${tenant.name}`, details: { personName: tenant.name, tenantId: tenant._id } });
  const u = toPlain(await col(C.users).doc(tenant._id).get());
  // Shown to the owner once, to hand over privately. It is not stored anywhere and is not in Activity History.
  res.json({ success: true, temporaryPassword: generated || undefined, expiresAt: u?.tempPasswordExpiresAt || null });
}

module.exports = { list, get, create, update, assign, transfer, moveOut, deactivate, reactivate, resetPassword, moneySummary };
