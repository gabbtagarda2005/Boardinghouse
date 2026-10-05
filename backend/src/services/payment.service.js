const { db, col, C, toPlain, listOf, now, nextCounter, readUnique, claimUnique, releaseUnique } = require('../db');
const ApiError = require('../utils/ApiError');
const { round2, sum, formatPeso } = require('../utils/money');
const { periodLabel } = require('../utils/dates');
const { audit } = require('./audit.service');
const { recalculate, writable } = require('./billing.service');
const { notifyUsers, notifyAdmins, emitToAdmins } = require('./notification.service');
const { getSettings } = require('./settings.service');
const { saveFile, deleteFile, newFileName } = require('./storage.service');
const { receiptPdf } = require('./pdf.service');
const { BILL_STATE, PAYMENT_STATUS, METHOD_LABELS, REJECTION_REASONS } = require('../constants');

const refKey = (method, ref) => (ref ? `payref:${method}:${String(ref).replace(/\s+/g, '').toUpperCase()}` : null);
const requestKey = (id) => (id ? `payreq:${id}` : null);
const methodText = (p) => (p.paymentMethod === 'BANK_TRANSFER' && p.provider ? `${p.provider} bank transfer` : METHOD_LABELS[p.paymentMethod] || 'Other');
const facts = (p) => ({ personName: p.tenantName, amount: p.amount, method: methodText(p), reference: p.referenceNumber || undefined, receiptNumber: p.receiptNumber || undefined, tenantId: p.tenantId });

/** Hides storage paths and internal keys from API responses. */
function presentPayment(p) {
  if (!p) return p;
  const { proof, referenceKey, clientRequestId, receiptPath, ...rest } = p;
  return { ...rest, hasProof: Boolean(proof?.path), proofType: proof?.contentType || null };
}

async function unpaidBills(tenantId, tx) {
  const q = col(C.bills).where('tenantId', '==', tenantId);
  const snap = tx ? await tx.get(q) : await q.get();
  return listOf(snap)
    .filter((b) => b.state === BILL_STATE.PUBLISHED && b.remainingBalance > 0)
    .sort((a, b) => a.billingYear - b.billingYear || a.billingMonth - b.billingMonth);
}

/**
 * Applies `amount` to the chosen bill first, then to the oldest unpaid bills.
 * Overpayments are refused.
 */
function planAllocations(bills, amount, preferredBillId) {
  const ordered = [...bills.filter((b) => b._id === preferredBillId), ...bills.filter((b) => b._id !== preferredBillId)];
  let remaining = round2(amount);
  const allocations = [];
  for (const bill of ordered) {
    if (remaining <= 0) break;
    const apply = round2(Math.min(remaining, bill.remainingBalance));
    if (apply <= 0) continue;
    allocations.push({ billId: bill._id, billNumber: bill.billNumber, billingYear: bill.billingYear, billingMonth: bill.billingMonth, amount: apply, bill });
    remaining = round2(remaining - apply);
  }
  if (remaining > 0) throw ApiError.badRequest(`This is more than the tenant owes (${formatPeso(sum(bills.map((b) => b.remainingBalance)))}). Overpayments are not accepted.`);
  return allocations;
}

function applyAllocations(tx, allocations) {
  for (const a of allocations) {
    const next = recalculate({ ...a.bill, amountPaid: round2(a.bill.amountPaid + a.amount) });
    tx.set(col(C.bills).doc(a.bill._id), { ...writable(next), updatedAt: now() });
  }
  return allocations.map(({ bill, ...rest }) => rest);
}

async function receiptNumberIn(tx) {
  const year = new Date().getFullYear();
  const c = await nextCounter(tx, `receipt-${year}`);
  return { number: `OR-${year}-${String(c.seq).padStart(5, '0')}`, write: c.write };
}

/** Creates the receipt PDF in Cloud Storage (best effort; it can always be regenerated). */
async function storeReceipt(paymentId) {
  try {
    const p = toPlain(await col(C.payments).doc(paymentId).get());
    const pdf = await receiptPdf(p, await getSettings());
    const path = `receipts/${p.tenantId}/${p.receiptNumber}.pdf`;
    await saveFile(path, pdf, 'application/pdf');
    await col(C.payments).doc(paymentId).update({ receiptPath: path });
  } catch (err) {
    console.warn('[receipt] could not store receipt:', err.message);
  }
}

async function notifyConfirmed(p) {
  const settings = await getSettings();
  if (!settings.notifications.notifyOnPaymentConfirm) return;
  notifyUsers([p.tenantId], {
    type: 'payment_confirmed',
    title: 'Payment confirmed',
    message: `Your payment of ${formatPeso(p.amount)} was confirmed (receipt ${p.receiptNumber}) for: ${p.allocations.map((a) => periodLabel(a.billingYear, a.billingMonth)).join(', ')}.`,
    data: { paymentId: p._id },
  });
}

/** Tenant sends a payment claim. It stays "waiting for verification" until the owner checks it. */
async function submitClaim(tenant, input, file, { req } = {}) {
  if (input.paymentMethod !== 'CASH' && !input.referenceNumber) throw ApiError.badRequest('Please enter the reference number from your receipt.');
  const bills = await unpaidBills(tenant._id);
  if (input.billId) {
    const bill = (await col(C.bills).doc(input.billId).get()).data();
    if (!bill || bill.tenantId !== tenant._id) throw ApiError.notFound('Bill not found');
    if (bill.state !== BILL_STATE.PUBLISHED) throw ApiError.badRequest('This bill cannot be paid yet.');
    if (bill.remainingBalance <= 0) throw ApiError.badRequest('This bill is already fully paid.');
  }
  const owed = sum(bills.map((b) => b.remainingBalance));
  if (round2(input.amount) > owed) throw ApiError.badRequest(`The amount is more than your balance (${formatPeso(owed)}).`);

  const ref = col(C.payments).doc();
  let proof = null;
  if (file) {
    const path = `payment-proofs/${tenant._id}/${ref.id}-${newFileName(file.mimetype)}`;
    proof = { ...(await saveFile(path, file.buffer, file.mimetype, { tenantId: tenant._id })), originalName: file.originalname?.slice(0, 120) || null };
  }
  const payment = {
    tenantId: tenant._id,
    tenantName: tenant.name,
    billId: input.billId || null,
    amount: round2(input.amount),
    paymentMethod: input.paymentMethod,
    provider: input.provider || null,
    referenceNumber: input.referenceNumber || null,
    referenceKey: refKey(input.paymentMethod, input.referenceNumber),
    paymentDate: input.paymentDate ? new Date(input.paymentDate) : now(),
    proof,
    notes: input.notes || null,
    status: PAYMENT_STATUS.PENDING,
    source: 'TENANT',
    allocations: [],
    clientRequestId: input.clientRequestId || null,
    submittedAt: now(),
    createdAt: now(),
    updatedAt: now(),
  };
  try {
    await db.runTransaction(async (tx) => {
      const rLock = payment.referenceKey ? await readUnique(tx, payment.referenceKey) : null;
      const qLock = payment.clientRequestId ? await readUnique(tx, requestKey(payment.clientRequestId)) : null;
      if (rLock) claimUnique(tx, rLock, ref.id, 'A payment with this reference number was already sent.');
      if (qLock) claimUnique(tx, qLock, ref.id, 'This payment was already sent.');
      tx.set(ref, payment);
      await audit(
        { actor: { uid: tenant._id, name: tenant.name }, req, action: 'payment.submit', entityType: 'Payment', entityId: ref.id, summary: `${tenant.name} submitted ${formatPeso(payment.amount)}`, details: facts(payment), after: { ...payment, proof: undefined } },
        tx
      );
    });
  } catch (err) {
    if (proof) deleteFile(proof.path);
    throw err;
  }
  notifyAdmins({
    type: 'payment_submitted',
    title: 'Payment Waiting for Verification',
    message: `${tenant.name} submitted a ${formatPeso(payment.amount)} payment (${methodText(payment)}${payment.referenceNumber ? `, ref ${payment.referenceNumber}` : ''}).`,
    data: { paymentId: ref.id },
  });
  emitToAdmins('payment:pending', { paymentId: ref.id });
  return presentPayment({ _id: ref.id, ...payment });
}

/** Owner confirms a payment claim. Runs in a transaction, so it can never be applied twice. */
async function confirmPayment(paymentId, { amount, note } = {}, { actor, req } = {}) {
  const result = await db.runTransaction(async (tx) => {
    const p = toPlain(await tx.get(col(C.payments).doc(paymentId)));
    if (!p) throw ApiError.notFound('Payment not found');
    if (p.status !== PAYMENT_STATUS.PENDING) throw ApiError.conflict('This payment was already checked.');
    const bills = await unpaidBills(p.tenantId, tx);
    const receipt = await receiptNumberIn(tx);
    const finalAmount = amount !== undefined ? round2(amount) : p.amount;
    if (finalAmount !== p.amount && !note) throw ApiError.badRequest('Please explain why the amount you received is different.');
    const allocations = applyAllocations(tx, planAllocations(bills, finalAmount, p.billId));
    receipt.write();
    const update = {
      amount: finalAmount,
      status: PAYMENT_STATUS.CONFIRMED,
      allocations,
      receiptNumber: receipt.number,
      verifiedAt: now(),
      verifiedBy: actor?.uid || null,
      verifiedByName: actor?.name || null,
      notes: finalAmount !== p.amount ? [p.notes, `Amount received changed from ${formatPeso(p.amount)} to ${formatPeso(finalAmount)}: ${note}`].filter(Boolean).join('\n') : p.notes,
      updatedAt: now(),
    };
    tx.update(col(C.payments).doc(paymentId), update);
    const after = { ...p, ...update };
    await audit(
      { actor, req, action: 'payment.confirm', entityType: 'Payment', entityId: paymentId, summary: `Confirmed ${formatPeso(finalAmount)} from ${p.tenantName}`, details: facts(after), before: { ...p, proof: undefined }, after: { ...after, proof: undefined }, reason: note },
      tx
    );
    return after;
  });
  await storeReceipt(paymentId);
  notifyConfirmed(result);
  return presentPayment(result);
}

async function rejectPayment(paymentId, { reasonCode, note }, { actor, req } = {}) {
  const label = REJECTION_REASONS[reasonCode] || REJECTION_REASONS.OTHER;
  const reason = reasonCode === 'OTHER' || !REJECTION_REASONS[reasonCode] ? note || label : note ? `${label}: ${note}` : label;
  if (!reason || reason === 'Other') throw ApiError.badRequest('Please describe why you are rejecting this payment.');
  const result = await db.runTransaction(async (tx) => {
    const p = toPlain(await tx.get(col(C.payments).doc(paymentId)));
    if (!p) throw ApiError.notFound('Payment not found');
    if (p.status !== PAYMENT_STATUS.PENDING) throw ApiError.conflict('This payment was already checked.');
    if (p.referenceKey) releaseUnique(tx, p.referenceKey); // the tenant may resend with the same reference
    const update = { status: PAYMENT_STATUS.REJECTED, rejectionReason: reason, rejectionCategory: reasonCode || 'OTHER', verifiedAt: now(), verifiedBy: actor?.uid || null, verifiedByName: actor?.name || null, referenceKey: null, updatedAt: now() };
    tx.update(col(C.payments).doc(paymentId), update);
    await audit({ actor, req, action: 'payment.reject', entityType: 'Payment', entityId: paymentId, summary: `Rejected ${formatPeso(p.amount)} from ${p.tenantName}`, details: facts(p), reason }, tx);
    return { ...p, ...update };
  });
  notifyUsers([result.tenantId], {
    type: 'payment_rejected',
    title: 'Payment not accepted',
    message: `Your payment of ${formatPeso(result.amount)}${result.referenceNumber ? ` (ref ${result.referenceNumber})` : ''} was not accepted. Reason: ${reason}`,
    data: { paymentId },
  });
  return presentPayment(result);
}

/** Owner records money received directly (e.g. cash). Confirmed immediately. */
async function recordPayment(input, { actor, req } = {}) {
  if (input.paymentMethod !== 'CASH' && !input.referenceNumber) throw ApiError.badRequest('Please enter the reference number for non-cash payments.');
  const tenant = toPlain(await col(C.tenants).doc(input.tenantId).get());
  if (!tenant) throw ApiError.notFound('Tenant not found');
  const ref = col(C.payments).doc();
  const result = await db.runTransaction(async (tx) => {
    const key = refKey(input.paymentMethod, input.referenceNumber);
    const rLock = key ? await readUnique(tx, key) : null;
    const qLock = input.clientRequestId ? await readUnique(tx, requestKey(input.clientRequestId)) : null;
    const bills = await unpaidBills(tenant._id, tx);
    const receipt = await receiptNumberIn(tx);
    if (rLock) claimUnique(tx, rLock, ref.id, 'A payment with this reference number was already recorded.');
    if (qLock) claimUnique(tx, qLock, ref.id, 'This payment was already recorded.');
    const allocations = applyAllocations(tx, planAllocations(bills, input.amount, input.billId));
    receipt.write();
    const payment = {
      tenantId: tenant._id,
      tenantName: tenant.name,
      billId: input.billId || null,
      amount: round2(input.amount),
      paymentMethod: input.paymentMethod,
      provider: input.provider || null,
      referenceNumber: input.referenceNumber || null,
      referenceKey: key,
      paymentDate: input.paymentDate ? new Date(input.paymentDate) : now(),
      proof: null,
      notes: input.notes || null,
      status: PAYMENT_STATUS.CONFIRMED,
      source: 'ADMIN',
      allocations,
      receiptNumber: receipt.number,
      clientRequestId: input.clientRequestId || null,
      submittedAt: now(),
      verifiedAt: now(),
      verifiedBy: actor?.uid || null,
      verifiedByName: actor?.name || null,
      createdAt: now(),
      updatedAt: now(),
    };
    tx.set(ref, payment);
    await audit({ actor, req, action: 'payment.record', entityType: 'Payment', entityId: ref.id, summary: `Recorded ${formatPeso(payment.amount)} from ${tenant.name}`, details: facts(payment), after: payment }, tx);
    return { _id: ref.id, ...payment };
  });
  await storeReceipt(ref.id);
  notifyConfirmed(result);
  return presentPayment(result);
}

/** Reverses a confirmed payment (to correct a mistake). Bill balances are restored. */
async function reversePayment(paymentId, reason, { actor, req } = {}) {
  if (!reason) throw ApiError.badRequest('Please give a reason.');
  const result = await db.runTransaction(async (tx) => {
    const p = toPlain(await tx.get(col(C.payments).doc(paymentId)));
    if (!p) throw ApiError.notFound('Payment not found');
    if (p.status !== PAYMENT_STATUS.CONFIRMED) throw ApiError.badRequest('Only confirmed payments can be reversed.');
    const bills = await Promise.all(p.allocations.map(async (a) => toPlain(await tx.get(col(C.bills).doc(a.billId)))));
    bills.forEach((bill, i) => {
      if (!bill) return;
      const next = recalculate({ ...bill, amountPaid: round2(Math.max(0, bill.amountPaid - p.allocations[i].amount)) });
      tx.set(col(C.bills).doc(bill._id), { ...writable(next), updatedAt: now() });
    });
    if (p.referenceKey) releaseUnique(tx, p.referenceKey);
    const update = { status: PAYMENT_STATUS.REVERSED, rejectionReason: reason, referenceKey: null, reversedAt: now(), reversedBy: actor?.uid || null, updatedAt: now() };
    tx.update(col(C.payments).doc(paymentId), update);
    await audit({ actor, req, action: 'payment.void', entityType: 'Payment', entityId: paymentId, summary: `Reversed ${p.receiptNumber}`, details: facts(p), before: { ...p, proof: undefined }, reason }, tx);
    return { ...p, ...update };
  });
  notifyUsers([result.tenantId], {
    type: 'general',
    title: 'Payment reversed',
    message: `Your payment ${result.receiptNumber} (${formatPeso(result.amount)}) was reversed by the owner. Reason: ${reason}`,
    data: { paymentId },
  });
  return presentPayment(result);
}

async function getPayment(id) {
  const p = toPlain(await col(C.payments).doc(id).get());
  if (!p) throw ApiError.notFound('Payment not found');
  return p;
}

module.exports = { submitClaim, confirmPayment, rejectPayment, recordPayment, reversePayment, presentPayment, getPayment, unpaidBills, planAllocations, methodText, storeReceipt };
