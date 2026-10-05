/** Electricity, bills and payments (admin). */
const { col, C, toPlain, listOf } = require('../db');
const ApiError = require('../utils/ApiError');
const { sum, formatPeso } = require('../utils/money');
const { periodLabel } = require('../utils/dates');
const electricity = require('../services/electricity.service');
const billing = require('../services/billing.service');
const payments = require('../services/payment.service');
const { historyFor } = require('../services/activity.service');
const { audit } = require('../services/audit.service');
const { notifyUsers } = require('../services/notification.service');
const { getSettings } = require('../services/settings.service');
const { billStatementPdf, receiptPdf } = require('../services/pdf.service');
const { streamFile } = require('../services/storage.service');
const { getPagination, paged } = require('../utils/pagination');
const { BILL_STATE, PAYMENT_STATUS } = require('../constants');

// ---------------- Electricity ----------------
const elec = {
  async list(req, res) {
    const q = req.valid.query;
    let query = col(C.electricityReadings);
    if (q.billingYear) query = query.where('billingYear', '==', q.billingYear);
    if (q.billingMonth) query = query.where('billingMonth', '==', q.billingMonth);
    let items = listOf(await query.get());
    if (q.roomId) items = items.filter((r) => r.roomId === q.roomId);
    items.sort((a, b) => b.billingYear - a.billingYear || b.billingMonth - a.billingMonth || a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
    res.json({ success: true, items, total: items.length });
  },
  async occupants(req, res) {
    const { roomId, billingYear, billingMonth } = req.valid.query;
    const room = toPlain(await col(C.rooms).doc(roomId).get());
    if (!room) throw ApiError.notFound('Room not found');
    const [list, last, existing] = await Promise.all([
      electricity.eligibleOccupants(roomId, billingYear, billingMonth),
      electricity.lastReadingBefore(roomId, billingYear, billingMonth),
      col(C.electricityReadings).doc(electricity.readingId(roomId, billingYear, billingMonth)).get().then(toPlain),
    ]);
    res.json({ success: true, occupants: list, previousReading: last?.currentReading ?? null, lastTenantMeters: last?.tenantMeters || null, existing });
  },
  async preview(req, res) {
    const { occupants, ...preview } = await electricity.computeReading(req.body);
    res.json({ success: true, preview });
  },
  async create(req, res) {
    res.status(201).json({ success: true, ...(await electricity.saveReading(req.body, { actor: req.user, req })) });
  },
  async update(req, res) {
    res.json({ success: true, ...(await electricity.saveReading(req.body, { actor: req.user, req, existingId: req.params.id })) });
  },
  async remove(req, res) {
    await electricity.deleteReading(req.params.id, { actor: req.user, req });
    res.json({ success: true });
  },
};

// ---------------- Bills ----------------
async function sendStatement(bill, res) {
  const [settings, paid] = await Promise.all([getSettings(), col(C.payments).where('tenantId', '==', bill.tenantId).get().then(listOf)]);
  const applied = paid.filter((p) => p.status === PAYMENT_STATUS.CONFIRMED && p.allocations.some((a) => a.billId === bill._id));
  const pdf = await billStatementPdf(await billing.withLivePreviousBalance(bill), settings, applied);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${bill.billNumber}.pdf"`);
  res.send(pdf);
}

const bills = {
  async list(req, res) {
    const q = req.valid.query;
    let items;
    if (q.billingYear && q.billingMonth) items = listOf(await col(C.bills).where('billingYear', '==', q.billingYear).where('billingMonth', '==', q.billingMonth).get());
    else if (q.tenantId) items = listOf(await col(C.bills).where('tenantId', '==', q.tenantId).get());
    else items = listOf(await col(C.bills).where('remainingBalance', '>', 0).get());
    if (q.tenantId) items = items.filter((b) => b.tenantId === q.tenantId);
    if (q.roomId) items = items.filter((b) => b.roomId === q.roomId);
    if (q.state && q.state !== 'ALL') items = items.filter((b) => b.state === q.state);
    else if (!q.state) items = items.filter((b) => b.state !== BILL_STATE.VOID);
    if (q.status) items = items.filter((b) => b.state === BILL_STATE.PUBLISHED && b.status === q.status);
    if (q.search) {
      const s = q.search.toLowerCase();
      items = items.filter((b) => [b.tenantName, b.roomNumber, b.billNumber].some((v) => v && String(v).toLowerCase().includes(s)));
    }
    items.sort((a, b) => b.billingYear - a.billingYear || b.billingMonth - a.billingMonth || String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true }) || a.tenantName.localeCompare(b.tenantName));
    const totals = { totalAmount: sum(items.map((b) => b.totalAmount)), amountPaid: sum(items.map((b) => b.amountPaid)), remainingBalance: sum(items.map((b) => b.remainingBalance)) };
    const pg = getPagination(q, { defaultLimit: 100, maxLimit: 500 });
    res.json({ success: true, ...paged(items.slice(pg.skip, pg.skip + pg.limit), items.length, pg), totals });
  },
  async summary(req, res) {
    const { billingYear, billingMonth } = req.valid.query;
    if (!billingYear || !billingMonth) throw ApiError.badRequest('Please choose a month.');
    const items = listOf(await col(C.bills).where('billingYear', '==', billingYear).where('billingMonth', '==', billingMonth).get()).filter((b) => b.state !== BILL_STATE.VOID);
    const sent = items.filter((b) => b.state === BILL_STATE.PUBLISHED);
    const drafts = items.filter((b) => b.state === BILL_STATE.DRAFT);
    res.json({
      success: true,
      summary: {
        drafts: drafts.length,
        published: sent.length,
        draftTotal: sum(drafts.map((b) => b.totalAmount)),
        publishedTotal: sum(sent.map((b) => b.totalAmount)),
        collected: sum(sent.map((b) => b.amountPaid)),
        balance: sum(sent.map((b) => b.remainingBalance)),
        paid: sent.filter((b) => b.status === 'PAID').length,
        overdue: sent.filter((b) => b.status === 'OVERDUE').length,
      },
    });
  },
  async generate(req, res) {
    const { created, skipped } = await billing.generateBills(req.body, { actor: req.user, req });
    res.status(201).json({ success: true, createdCount: created.length, created, skipped });
  },
  async publish(req, res) {
    const published = await billing.publishBills(req.body, { actor: req.user, req });
    res.json({ success: true, publishedCount: published.length });
  },
  async get(req, res) {
    const bill = await billing.getBill(req.params.id);
    const [paymentsList, history] = await Promise.all([col(C.payments).where('tenantId', '==', bill.tenantId).get().then(listOf), historyFor(bill._id)]);
    const related = paymentsList.filter((p) => p.billId === bill._id || p.allocations?.some((a) => a.billId === bill._id)).sort((a, b) => b.submittedAt - a.submittedAt);
    res.json({ success: true, bill: await billing.withLivePreviousBalance(bill), payments: related.map(payments.presentPayment), history });
  },
  async updateDraft(req, res) {
    res.json({ success: true, bill: await billing.updateDraft(req.params.id, req.body, { actor: req.user, req }) });
  },
  async adjust(req, res) {
    res.json({ success: true, bill: await billing.adjustPublished(req.params.id, req.body, { actor: req.user, req }) });
  },
  async voidBill(req, res) {
    const bill = await billing.voidBill(req.params.id, req.body.reason, { actor: req.user, req });
    res.json({ success: true, bill, deleted: !bill });
  },
  async remind(req, res) {
    const bill = await billing.getBill(req.params.id);
    if (bill.state !== BILL_STATE.PUBLISHED || bill.remainingBalance <= 0) throw ApiError.badRequest('Only unpaid bills that were sent can be reminded.');
    const late = new Date(bill.dueDate) < new Date();
    await notifyUsers([bill.tenantId], {
      type: late ? 'overdue' : 'due_reminder',
      title: late ? 'Overdue bill reminder' : 'Payment reminder',
      message:
        req.body?.message ||
        `Your ${periodLabel(bill.billingYear, bill.billingMonth)} bill of ${formatPeso(bill.remainingBalance)} ${late ? 'is overdue' : `is due on ${new Date(bill.dueDate).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric' })}`}.`,
      data: { billId: bill._id },
    });
    await audit({
      actor: req.user,
      req,
      action: 'bill.remind',
      entityType: 'Bill',
      entityId: bill._id,
      summary: `Reminder sent to ${bill.tenantName}`,
      details: { personName: bill.tenantName, period: periodLabel(bill.billingYear, bill.billingMonth), amount: bill.remainingBalance },
    });
    res.json({ success: true, message: 'Reminder sent' });
  },
  async statement(req, res) {
    await sendStatement(await billing.getBill(req.params.id), res);
  },
};

// ---------------- Payments ----------------
async function sendReceipt(p, res) {
  if (p.status !== PAYMENT_STATUS.CONFIRMED || !p.receiptNumber) throw ApiError.badRequest('A receipt is available after the payment is confirmed.');
  if (p.receiptPath) {
    try {
      await streamFile(p.receiptPath, res, { contentType: 'application/pdf', filename: `${p.receiptNumber}.pdf`, inline: false });
      return;
    } catch (err) {
      if (res.headersSent) throw err;
    }
  }
  const pdf = await receiptPdf(p, await getSettings());
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${p.receiptNumber}.pdf"`);
  res.send(pdf);
}

async function sendProof(p, res) {
  if (!p.proof?.path) throw ApiError.notFound('No payment proof was attached.');
  await streamFile(p.proof.path, res, { contentType: p.proof.contentType, filename: `payment-proof${p.proof.contentType === 'application/pdf' ? '.pdf' : ''}` });
}

const pays = {
  async list(req, res) {
    const q = req.valid.query;
    let query = col(C.payments);
    if (q.status && q.status !== 'ALL') query = query.where('status', '==', q.status);
    if (q.tenantId) query = query.where('tenantId', '==', q.tenantId);
    let items = listOf(await query.get());
    if (q.paymentMethod) items = items.filter((p) => p.paymentMethod === q.paymentMethod);
    if (q.billId) items = items.filter((p) => p.billId === q.billId || p.allocations?.some((a) => a.billId === q.billId));
    if (q.from) items = items.filter((p) => p.paymentDate >= new Date(`${q.from}T00:00:00+08:00`));
    if (q.to) items = items.filter((p) => p.paymentDate <= new Date(`${q.to}T23:59:59.999+08:00`));
    if (q.search) {
      const s = q.search.toLowerCase();
      items = items.filter((p) => [p.tenantName, p.referenceNumber, p.receiptNumber].some((v) => v && v.toLowerCase().includes(s)));
    }
    items.sort((a, b) => b.submittedAt - a.submittedAt);
    const pending = await col(C.payments).where('status', '==', PAYMENT_STATUS.PENDING).count().get();
    const pg = getPagination(q, { defaultLimit: 50, maxLimit: 500 });
    res.json({ success: true, ...paged(items.slice(pg.skip, pg.skip + pg.limit).map(payments.presentPayment), items.length, pg), pendingCount: pending.data().count });
  },
  async get(req, res) {
    const p = await payments.getPayment(req.params.id);
    const bill = p.billId ? toPlain(await col(C.bills).doc(p.billId).get()) : null;
    res.json({ success: true, payment: { ...payments.presentPayment(p), bill: bill && { _id: bill._id, billingYear: bill.billingYear, billingMonth: bill.billingMonth, billNumber: bill.billNumber, remainingBalance: bill.remainingBalance } } });
  },
  async record(req, res) {
    res.status(201).json({ success: true, payment: await payments.recordPayment(req.body, { actor: req.user, req }) });
  },
  async confirm(req, res) {
    res.json({ success: true, payment: await payments.confirmPayment(req.params.id, req.body, { actor: req.user, req }) });
  },
  async reject(req, res) {
    res.json({ success: true, payment: await payments.rejectPayment(req.params.id, req.body, { actor: req.user, req }) });
  },
  async reverse(req, res) {
    res.json({ success: true, payment: await payments.reversePayment(req.params.id, req.body.reason, { actor: req.user, req }) });
  },
  async proof(req, res) {
    await sendProof(await payments.getPayment(req.params.id), res);
  },
  async receipt(req, res) {
    await sendReceipt(await payments.getPayment(req.params.id), res);
  },
};

module.exports = { elec, bills, pays, sendStatement, sendReceipt, sendProof };
