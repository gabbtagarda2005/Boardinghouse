const { db, col, C, toPlain, listOf, now, getMany, nextCounter, readUnique, claimUnique, releaseUnique, chunk } = require('../db');
const ApiError = require('../utils/ApiError');
const { round2, sum, formatPeso } = require('../utils/money');
const { monthRange, dueDateFor, periodKey, periodLabel } = require('../utils/dates');
const { audit } = require('./audit.service');
const { notifyUsers } = require('./notification.service');
const { getSettings } = require('./settings.service');
const { electricityFromReadings, readingsForMonth } = require('./electricity.service');
const { BILL_STATE, BILL_STATUS, PAYMENT_STATUS } = require('../constants');

const billKey = (tenantId, year, month) => `bill:${tenantId}:${periodKey(year, month)}`;

function deriveStatus(bill, at = new Date()) {
  if (round2(bill.remainingBalance) <= 0) return BILL_STATUS.PAID;
  if (bill.state === BILL_STATE.PUBLISHED && bill.dueDate && new Date(bill.dueDate) < at) return BILL_STATUS.OVERDUE;
  if (bill.amountPaid > 0) return BILL_STATUS.PARTIALLY_PAID;
  return BILL_STATUS.UNPAID;
}

/**
 * Recomputes every amount on a bill. The backend is the only place totals are calculated.
 * Returns a new bill object.
 */
function recalculate(bill, at = new Date()) {
  const b = { ...bill };
  b.rent = round2(b.rent);
  b.electricity = round2(b.electricity);
  b.water = round2(b.water);
  b.otherCharges = (b.otherCharges || []).map((c) => ({ label: c.label, amount: round2(c.amount) }));
  b.adjustments = (b.adjustments || []).map((c) => ({ label: c.label, amount: round2(c.amount) }));
  const other = sum(b.otherCharges.map((c) => c.amount));
  const adj = sum(b.adjustments.map((c) => c.amount));
  b.discount = round2(Math.abs(sum(b.adjustments.filter((c) => c.amount < 0).map((c) => c.amount))));
  const total = round2(b.rent + b.electricity + b.water + other + adj);
  if (total < 0) throw ApiError.badRequest('The discount is larger than the bill. Please lower the discount.');
  b.totalAmount = total;
  b.amountPaid = round2(b.amountPaid || 0);
  if (b.amountPaid > b.totalAmount) {
    throw ApiError.badRequest(`The new total (${formatPeso(b.totalAmount)}) would be less than what the tenant already paid (${formatPeso(b.amountPaid)}).`);
  }
  b.remainingBalance = round2(b.totalAmount - b.amountPaid);
  b.status = deriveStatus(b, at);
  b.paidAt = b.status === BILL_STATUS.PAID && b.state === BILL_STATE.PUBLISHED ? b.paidAt || at : null;
  return b;
}

/** Strips the id so a bill object can be written back to Firestore. */
const writable = ({ _id, ...rest }) => rest;

async function billsOfTenant(tenantId) {
  return listOf(await col(C.bills).where('tenantId', '==', tenantId).get());
}

const isBefore = (b, year, month) => b.billingYear < year || (b.billingYear === year && b.billingMonth < month);

async function outstandingBefore(tenantId, year, month) {
  return sum(
    (await billsOfTenant(tenantId)).filter((b) => b.state === BILL_STATE.PUBLISHED && b.remainingBalance > 0 && isBefore(b, year, month)).map((b) => b.remainingBalance)
  );
}

/** Adds a live "previous unpaid balance" to bills (the stored one is a snapshot from sending). */
async function withLivePreviousBalance(bills) {
  const list = Array.isArray(bills) ? bills : [bills];
  const tenantIds = [...new Set(list.map((b) => b.tenantId))];
  const unpaid = [];
  for (const part of chunk(tenantIds)) {
    unpaid.push(...listOf(await col(C.bills).where('tenantId', 'in', part).get()).filter((b) => b.state === BILL_STATE.PUBLISHED && b.remainingBalance > 0));
  }
  const out = list.map((b) => ({
    ...b,
    previousBalance: sum(unpaid.filter((u) => u.tenantId === b.tenantId && isBefore(u, b.billingYear, b.billingMonth)).map((u) => u.remainingBalance)),
  }));
  return Array.isArray(bills) ? out : out[0];
}

/**
 * Creates bills (not yet sent) for every tenant who stayed in a room during the month.
 * Existing bills are skipped, so running it twice never creates duplicates.
 */
async function generateBills({ billingYear: year, billingMonth: month, dueDate, tenantIds, includeWater }, { actor, req } = {}) {
  const settings = await getSettings();
  const { start, end } = monthRange(year, month);
  const due = dueDate ? new Date(dueDate) : dueDateFor(year, month, settings.defaultDueDay);

  const stays = listOf(await col(C.roomAssignments).where('startDate', '<', end).get()).filter((a) => !a.endDate || a.endDate > start);
  const latestByTenant = new Map();
  for (const a of stays) {
    if (tenantIds?.length && !tenantIds.includes(a.tenantId)) continue;
    const prev = latestByTenant.get(a.tenantId);
    if (!prev || a.startDate > prev.startDate) latestByTenant.set(a.tenantId, a);
  }
  const tenants = await getMany(C.tenants, [...latestByTenant.keys()]);
  const readings = await readingsForMonth(year, month);
  const useWater = includeWater ?? settings.waterEnabled;

  const created = [];
  const skipped = [];
  for (const [tenantId, assignment] of latestByTenant) {
    const tenant = tenants.get(tenantId);
    const name = tenant?.name || assignment.tenantName;
    const previousBalance = await outstandingBefore(tenantId, year, month);
    const elec = electricityFromReadings(readings, tenantId, assignment.roomId);
    try {
      const bill = await db.runTransaction(async (tx) => {
        const lock = await readUnique(tx, billKey(tenantId, year, month));
        if (lock.exists) throw ApiError.conflict('exists');
        const counter = await nextCounter(tx, `bill-${periodKey(year, month)}`);
        const ref = col(C.bills).doc();
        const doc = recalculate({
          billNumber: `BILL-${year}${String(month).padStart(2, '0')}-${String(counter.seq).padStart(4, '0')}`,
          tenantId,
          tenantName: name,
          assignmentId: assignment._id,
          roomId: assignment.roomId,
          roomNumber: assignment.roomNumber,
          bedNumber: assignment.bedNumber,
          billingYear: year,
          billingMonth: month,
          rent: assignment.monthlyRent,
          electricity: elec.amount,
          electricityDetail: elec.detail,
          water: useWater ? settings.waterChargePerTenant : 0,
          otherCharges: (settings.defaultOtherCharges || []).filter((c) => c.label && c.amount).map((c) => ({ label: c.label, amount: c.amount })),
          adjustments: [],
          previousBalance,
          amountPaid: 0,
          dueDate: due,
          state: BILL_STATE.DRAFT,
          notes: null,
          createdBy: actor?.uid || null,
          createdAt: now(),
          updatedAt: now(),
        });
        counter.write();
        claimUnique(tx, lock, ref.id);
        tx.set(ref, doc);
        return { _id: ref.id, ...doc };
      });
      created.push(bill);
    } catch (err) {
      if (err.status === 409) skipped.push({ tenantId, tenantName: name, reason: 'Already has a bill for this month' });
      else throw err;
    }
  }

  if (created.length) {
    await audit({
      actor,
      req,
      action: 'bill.generate',
      entityType: 'Bill',
      entityId: created.length === 1 ? created[0]._id : undefined,
      summary: `Created ${created.length} bill(s) for ${periodLabel(year, month)}`,
      details: { period: periodLabel(year, month), count: created.length, personName: created.length === 1 ? created[0].tenantName : undefined },
      after: { billIds: created.map((b) => b._id) },
    });
  }
  return { created, skipped };
}

async function getBill(id) {
  const bill = toPlain(await col(C.bills).doc(id).get());
  if (!bill) throw ApiError.notFound('Bill not found');
  return bill;
}

async function updateDraft(billId, changes, { actor, req } = {}) {
  const old = await getBill(billId);
  if (old.state !== BILL_STATE.DRAFT) throw ApiError.badRequest('This bill was already sent. To change it, add a discount or extra charge instead.');
  let next = { ...old };
  for (const f of ['rent', 'electricity', 'water', 'otherCharges', 'adjustments', 'notes']) if (changes[f] !== undefined) next[f] = changes[f];
  if (changes.dueDate) next.dueDate = new Date(changes.dueDate);
  if (changes.electricity !== undefined && round2(changes.electricity) !== round2(old.electricity)) {
    next.electricityDetail = { ...(old.electricityDetail || {}), manualOverride: true };
  }
  if (changes.resetElectricity) {
    const elec = electricityFromReadings(await readingsForMonth(old.billingYear, old.billingMonth), old.tenantId, old.roomId);
    next.electricity = elec.amount;
    next.electricityDetail = elec.detail;
  }
  next = recalculate(next);
  await col(C.bills).doc(billId).set({ ...writable(next), updatedAt: now() });
  await audit({
    actor,
    req,
    action: 'bill.update_draft',
    entityType: 'Bill',
    entityId: billId,
    summary: `Edited ${old.billNumber}`,
    details: { personName: old.tenantName, period: periodLabel(old.billingYear, old.billingMonth), amount: next.totalAmount },
    before: old,
    after: next,
  });
  return { ...next, _id: billId };
}

/** Adds a discount (negative) or extra charge (positive) to a sent bill. Always audited. */
async function adjustPublished(billId, { label, amount, reason }, { actor, req } = {}) {
  if (!reason) throw ApiError.badRequest('Please give a reason for this change.');
  const result = await db.runTransaction(async (tx) => {
    const old = toPlain(await tx.get(col(C.bills).doc(billId)));
    if (!old) throw ApiError.notFound('Bill not found');
    if (old.state !== BILL_STATE.PUBLISHED) throw ApiError.badRequest('Only sent bills can be adjusted. Edit the bill instead.');
    const next = recalculate({ ...old, adjustments: [...(old.adjustments || []), { label, amount: round2(amount) }] });
    tx.set(col(C.bills).doc(billId), { ...writable(next), updatedAt: now() });
    await audit(
      {
        actor,
        req,
        action: 'bill.adjust',
        entityType: 'Bill',
        entityId: billId,
        summary: `${amount < 0 ? 'Discount' : 'Charge'} of ${formatPeso(Math.abs(amount))} (${label}) on ${old.billNumber}`,
        details: { personName: old.tenantName, period: periodLabel(old.billingYear, old.billingMonth), amount: Math.abs(amount), label, kind: amount < 0 ? 'discount' : 'charge' },
        before: old,
        after: next,
        reason,
      },
      tx
    );
    return { ...next, _id: billId };
  });
  notifyUsers([result.tenantId], {
    type: 'general',
    title: 'Your bill was updated',
    message: `Your ${periodLabel(result.billingYear, result.billingMonth)} bill was ${amount < 0 ? 'given a discount' : 'updated'}: ${label} (${formatPeso(Math.abs(amount))}). New balance: ${formatPeso(result.remainingBalance)}.`,
    data: { billId },
  });
  return result;
}

/** Sends bills to tenants (they become visible in the app and tenants are notified). */
async function publishBills({ billIds, billingYear, billingMonth }, { actor, req } = {}) {
  let drafts;
  if (billIds?.length) drafts = [...(await getMany(C.bills, billIds)).values()];
  else if (billingYear && billingMonth) drafts = listOf(await col(C.bills).where('billingYear', '==', billingYear).where('billingMonth', '==', billingMonth).get());
  else throw ApiError.badRequest('Choose which bills to send.');
  drafts = drafts.filter((b) => b.state === BILL_STATE.DRAFT);
  if (!drafts.length) throw ApiError.badRequest('There are no unsent bills to send.');

  const at = now();
  const published = [];
  const readingIds = new Set();
  for (const part of chunk(drafts, 200)) {
    const batch = db.batch();
    for (const bill of part) {
      const previousBalance = await outstandingBefore(bill.tenantId, bill.billingYear, bill.billingMonth);
      const next = recalculate({ ...bill, previousBalance, state: BILL_STATE.PUBLISHED, publishedAt: at, publishedBy: actor?.uid || null }, at);
      batch.set(col(C.bills).doc(bill._id), { ...writable(next), updatedAt: at });
      published.push({ ...next, _id: bill._id });
      if (bill.electricityDetail?.readingId) readingIds.add(bill.electricityDetail.readingId);
    }
    await batch.commit();
  }
  // Readings used by sent bills can no longer be changed silently.
  if (readingIds.size) {
    const lockBatch = db.batch();
    readingIds.forEach((id) => lockBatch.set(col(C.electricityReadings).doc(id), { locked: true }, { merge: true }));
    await lockBatch.commit();
  }

  await audit({
    actor,
    req,
    action: 'bill.publish',
    entityType: 'Bill',
    entityId: published.length === 1 ? published[0]._id : undefined,
    summary: `Sent ${published.length} bill(s)`,
    details: {
      count: published.length,
      period: [...new Set(published.map((b) => periodLabel(b.billingYear, b.billingMonth)))].join(', '),
      personName: published.length === 1 ? published[0].tenantName : undefined,
    },
    after: { billIds: published.map((b) => b._id) },
  });

  const settings = await getSettings();
  if (settings.notifications.notifyOnBillPublish) {
    for (const bill of published) {
      notifyUsers([bill.tenantId], {
        type: 'bill_published',
        title: `New bill for ${periodLabel(bill.billingYear, bill.billingMonth)}`,
        message: `Your bill of ${formatPeso(bill.totalAmount)} is due on ${new Date(bill.dueDate).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric' })}.`,
        data: { billId: bill._id },
        dedupeKey: `bill-published:${bill._id}`,
      });
    }
  }
  return published;
}

/** Deletes an unsent bill, or cancels a sent bill that has no payments. */
async function voidBill(billId, reason, { actor, req } = {}) {
  if (!reason) throw ApiError.badRequest('Please give a reason.');
  const result = await db.runTransaction(async (tx) => {
    const bill = toPlain(await tx.get(col(C.bills).doc(billId)));
    if (!bill) throw ApiError.notFound('Bill not found');
    if (bill.state === BILL_STATE.VOID) throw ApiError.badRequest('This bill is already cancelled.');
    if (bill.amountPaid > 0) throw ApiError.badRequest('This bill already has payments. Reverse the payments first, or add a discount instead.');
    const payments = await tx.get(col(C.payments).where('billId', '==', billId));
    if (payments.docs.some((d) => d.data().status === PAYMENT_STATUS.PENDING)) throw ApiError.badRequest('A payment for this bill is waiting for your check. Confirm or reject it first.');

    releaseUnique(tx, billKey(bill.tenantId, bill.billingYear, bill.billingMonth));
    const deleted = bill.state === BILL_STATE.DRAFT;
    if (deleted) tx.delete(col(C.bills).doc(billId));
    else tx.update(col(C.bills).doc(billId), { state: BILL_STATE.VOID, voidReason: reason, updatedAt: now() });
    await audit(
      {
        actor,
        req,
        action: deleted ? 'bill.delete_draft' : 'bill.void',
        entityType: 'Bill',
        entityId: billId,
        summary: `${deleted ? 'Deleted' : 'Cancelled'} ${bill.billNumber}`,
        details: { personName: bill.tenantName, period: periodLabel(bill.billingYear, bill.billingMonth), amount: bill.totalAmount },
        before: bill,
        reason,
      },
      tx
    );
    return { bill, deleted };
  });
  if (!result.deleted) {
    notifyUsers([result.bill.tenantId], {
      type: 'general',
      title: 'Bill cancelled',
      message: `Your ${periodLabel(result.bill.billingYear, result.bill.billingMonth)} bill was cancelled. Reason: ${reason}`,
      data: { billId },
    });
  }
  return result.deleted ? null : { ...result.bill, state: BILL_STATE.VOID, voidReason: reason };
}

/** Marks sent bills past their due date with a balance as OVERDUE. */
async function refreshOverdue(at = new Date()) {
  const unpaid = listOf(await col(C.bills).where('remainingBalance', '>', 0).get()).filter(
    (b) => b.state === BILL_STATE.PUBLISHED && b.dueDate < at && b.status !== BILL_STATUS.OVERDUE
  );
  for (const part of chunk(unpaid, 400)) {
    const batch = db.batch();
    part.forEach((b) => batch.update(col(C.bills).doc(b._id), { status: BILL_STATUS.OVERDUE }));
    await batch.commit();
  }
  return unpaid.length;
}

module.exports = {
  deriveStatus,
  recalculate,
  writable,
  billKey,
  billsOfTenant,
  outstandingBefore,
  withLivePreviousBalance,
  generateBills,
  getBill,
  updateDraft,
  adjustPublished,
  publishBills,
  voidBill,
  refreshOverdue,
};
