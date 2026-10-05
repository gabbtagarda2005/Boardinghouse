const ExcelJS = require('exceljs');
const { col, C, listOf, toPlain } = require('../db');
const ApiError = require('../utils/ApiError');
const { sum, round2 } = require('../utils/money');
const { periodLabel, MONTHS } = require('../utils/dates');
const { peso } = require('./pdf.service');
const { BILL_STATE, BILL_STATUS, PAYMENT_STATUS, METHOD_LABELS } = require('../constants');

const STATUS_LABEL = { UNPAID: 'Unpaid', PARTIALLY_PAID: 'Partially paid', PAID: 'Paid', OVERDUE: 'Overdue' };
const ROOM_LABEL = { AVAILABLE: 'Available', PARTIALLY_OCCUPIED: 'Partially occupied', FULL: 'Full', MAINTENANCE: 'Under repair' };
const TENANT_LABEL = { ACTIVE: 'Active', MOVED_OUT: 'Moved out', INACTIVE: 'Inactive' };

const parsePeriod = (p) => (p ? p.split('-').map(Number) : null);
function inPeriod(b, q) {
  const f = parsePeriod(q.fromPeriod);
  const t = parsePeriod(q.toPeriod);
  if (f && (b.billingYear < f[0] || (b.billingYear === f[0] && b.billingMonth < f[1]))) return false;
  if (t && (b.billingYear > t[0] || (b.billingYear === t[0] && b.billingMonth > t[1]))) return false;
  return true;
}
function inDates(d, q) {
  if (q.from && d < new Date(`${q.from}T00:00:00+08:00`)) return false;
  if (q.to && d > new Date(`${q.to}T23:59:59.999+08:00`)) return false;
  return true;
}
const matches = (q, ...values) => !q.search || values.some((v) => v && String(v).toLowerCase().includes(q.search.toLowerCase()));

async function billsFor(q) {
  const f = parsePeriod(q.fromPeriod);
  const t = parsePeriod(q.toPeriod);
  let query = col(C.bills);
  if (f) query = query.where('billingYear', '>=', f[0]);
  if (t) query = query.where('billingYear', '<=', t[0]);
  return listOf(await query.get()).filter((b) => inPeriod(b, q));
}

async function confirmedPayments(q) {
  let query = col(C.payments);
  if (q.from) query = query.where('paymentDate', '>=', new Date(`${q.from}T00:00:00+08:00`));
  if (q.to) query = query.where('paymentDate', '<=', new Date(`${q.to}T23:59:59.999+08:00`));
  return listOf(await query.get()).filter((p) => p.status === PAYMENT_STATUS.CONFIRMED);
}

const builders = {
  async 'monthly-collection'(q) {
    const bills = (await billsFor(q)).filter((b) => b.state === BILL_STATE.PUBLISHED);
    const payments = await confirmedPayments(q);
    const rows = new Map();
    const key = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
    const row = (y, m) => {
      const k = key(y, m);
      if (!rows.has(k)) rows.set(k, { period: k, label: periodLabel(y, m), billed: 0, collected: 0, payments: 0, outstanding: 0 });
      return rows.get(k);
    };
    bills.forEach((b) => {
      const r = row(b.billingYear, b.billingMonth);
      r.billed = round2(r.billed + b.totalAmount);
      r.outstanding = round2(r.outstanding + b.remainingBalance);
    });
    payments.forEach((p) => {
      const d = new Date(p.paymentDate.getTime() + 8 * 3600000);
      const r = row(d.getUTCFullYear(), d.getUTCMonth() + 1);
      r.collected = round2(r.collected + p.amount);
      r.payments += 1;
    });
    const list = [...rows.values()].sort((a, b) => a.period.localeCompare(b.period));
    return {
      title: 'Monthly Collection',
      columns: [
        { header: 'Month', key: 'label', width: 2 },
        { header: 'Total billed', key: 'billed', format: 'money', width: 2 },
        { header: 'Collected', key: 'collected', format: 'money', width: 2 },
        { header: 'Payments', key: 'payments', width: 1, align: 'right' },
        { header: 'Still unpaid', key: 'outstanding', format: 'money', width: 2 },
      ],
      rows: list,
      summary: [
        ['Total billed', peso(sum(list.map((r) => r.billed)))],
        ['Total collected', peso(sum(list.map((r) => r.collected)))],
      ],
    };
  },

  async 'monthly-billing'(q) {
    const bills = (await billsFor(q)).filter((b) => b.state === BILL_STATE.PUBLISHED && (!q.status || b.status === q.status) && matches(q, b.tenantName, b.roomNumber, b.billNumber));
    bills.sort((a, b) => a.billingYear - b.billingYear || a.billingMonth - b.billingMonth || a.tenantName.localeCompare(b.tenantName));
    const rows = bills.map((b) => ({
      ...b,
      period: periodLabel(b.billingYear, b.billingMonth),
      other: round2(sum((b.otherCharges || []).map((c) => c.amount)) + sum((b.adjustments || []).map((c) => c.amount))),
      statusLabel: STATUS_LABEL[b.status],
    }));
    return {
      title: 'Monthly Billing',
      columns: [
        { header: 'Month', key: 'period', width: 2 },
        { header: 'Tenant', key: 'tenantName', width: 3 },
        { header: 'Room', key: 'roomNumber', width: 1 },
        { header: 'Rent', key: 'rent', format: 'money', width: 2 },
        { header: 'Electricity', key: 'electricity', format: 'money', width: 2 },
        { header: 'Water', key: 'water', format: 'money', width: 1.5 },
        { header: 'Other', key: 'other', format: 'money', width: 1.5 },
        { header: 'Total', key: 'totalAmount', format: 'money', width: 2 },
        { header: 'Paid', key: 'amountPaid', format: 'money', width: 2 },
        { header: 'Balance', key: 'remainingBalance', format: 'money', width: 2 },
        { header: 'Status', key: 'statusLabel', width: 1.6 },
      ],
      rows,
      summary: [
        ['Bills', rows.length],
        ['Total billed', peso(sum(rows.map((r) => r.totalAmount)))],
        ['Total paid', peso(sum(rows.map((r) => r.amountPaid)))],
        ['Still unpaid', peso(sum(rows.map((r) => r.remainingBalance)))],
      ],
    };
  },

  async 'payment-history'(q) {
    const payments = (await confirmedPayments(q))
      .filter((p) => (!q.method || p.paymentMethod === q.method) && inDates(p.paymentDate, q) && matches(q, p.tenantName, p.referenceNumber, p.receiptNumber))
      .sort((a, b) => a.paymentDate - b.paymentDate);
    const rows = payments.map((p) => ({
      ...p,
      methodLabel: `${METHOD_LABELS[p.paymentMethod] || 'Other'}${p.provider ? ` (${p.provider})` : ''}`,
      appliedTo: p.allocations.map((a) => `${MONTHS[a.billingMonth - 1].slice(0, 3)} ${a.billingYear}`).join(', '),
    }));
    return {
      title: 'Payment History',
      columns: [
        { header: 'Date', key: 'paymentDate', format: 'date', width: 1.5 },
        { header: 'Receipt', key: 'receiptNumber', width: 2 },
        { header: 'Tenant', key: 'tenantName', width: 3 },
        { header: 'Method', key: 'methodLabel', width: 2 },
        { header: 'Reference', key: 'referenceNumber', width: 2 },
        { header: 'For bill(s)', key: 'appliedTo', width: 2.5 },
        { header: 'Amount', key: 'amount', format: 'money', width: 2 },
      ],
      rows,
      summary: [
        ['Payments', rows.length],
        ['Total collected', peso(sum(rows.map((r) => r.amount)))],
      ],
    };
  },

  async outstanding(q) {
    const bills = (await billsFor(q)).filter((b) => b.state === BILL_STATE.PUBLISHED && b.remainingBalance > 0 && matches(q, b.tenantName, b.roomNumber));
    const by = new Map();
    for (const b of bills) {
      const r = by.get(b.tenantId) || { tenantName: b.tenantName, roomNumber: b.roomNumber, bills: 0, overdueBills: 0, balance: 0, oldestDue: b.dueDate };
      r.bills += 1;
      if (b.status === BILL_STATUS.OVERDUE) r.overdueBills += 1;
      r.balance = round2(r.balance + b.remainingBalance);
      if (b.dueDate < r.oldestDue) r.oldestDue = b.dueDate;
      by.set(b.tenantId, r);
    }
    const rows = [...by.values()].sort((a, b) => b.balance - a.balance);
    return {
      title: 'Outstanding Balances',
      columns: [
        { header: 'Tenant', key: 'tenantName', width: 3 },
        { header: 'Room', key: 'roomNumber', width: 1 },
        { header: 'Unpaid bills', key: 'bills', width: 1, align: 'right' },
        { header: 'Overdue bills', key: 'overdueBills', width: 1, align: 'right' },
        { header: 'Oldest due date', key: 'oldestDue', format: 'date', width: 2 },
        { header: 'Balance', key: 'balance', format: 'money', width: 2 },
      ],
      rows,
      summary: [
        ['Tenants with a balance', rows.length],
        ['Total unpaid', peso(sum(rows.map((r) => r.balance)))],
      ],
    };
  },

  async overdue(q) {
    const at = Date.now();
    const bills = (await billsFor(q))
      .filter((b) => b.state === BILL_STATE.PUBLISHED && b.remainingBalance > 0 && b.dueDate < at && matches(q, b.tenantName, b.roomNumber, b.billNumber))
      .sort((a, b) => a.dueDate - b.dueDate);
    const rows = bills.map((b) => ({ ...b, period: periodLabel(b.billingYear, b.billingMonth), daysOverdue: Math.floor((at - b.dueDate.getTime()) / 86400000) }));
    return {
      title: 'Overdue Payments',
      columns: [
        { header: 'Tenant', key: 'tenantName', width: 3 },
        { header: 'Room', key: 'roomNumber', width: 1 },
        { header: 'Month', key: 'period', width: 2 },
        { header: 'Due date', key: 'dueDate', format: 'date', width: 1.5 },
        { header: 'Days late', key: 'daysOverdue', width: 1, align: 'right' },
        { header: 'Balance', key: 'remainingBalance', format: 'money', width: 2 },
      ],
      rows,
      summary: [
        ['Overdue bills', rows.length],
        ['Total overdue', peso(sum(rows.map((r) => r.remainingBalance)))],
      ],
    };
  },

  async occupancy(q) {
    const rooms = listOf(await col(C.rooms).where('isArchived', '==', false).get())
      .filter((r) => matches(q, r.roomNumber, r.name, r.building))
      .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
    const tenants = listOf(await col(C.tenants).where('status', '==', 'ACTIVE').get());
    const rows = rooms.map((r) => ({
      roomNumber: r.roomNumber,
      building: r.building || '',
      capacity: r.capacity,
      occupied: r.occupiedBeds || 0,
      available: r.underMaintenance ? 0 : Math.max(0, r.capacity - (r.occupiedBeds || 0)),
      status: ROOM_LABEL[r.status] || r.status,
      monthlyRent: r.monthlyRent,
      occupants: tenants
        .filter((t) => t.currentRoomId === r._id)
        .sort((a, b) => (a.currentBedNumber || 0) - (b.currentBedNumber || 0))
        .map((t) => `${t.name} (Bed ${t.currentBedNumber})`)
        .join(', '),
    }));
    const cap = sum(rows.map((r) => r.capacity));
    const occ = sum(rows.map((r) => r.occupied));
    return {
      title: 'Room Occupancy',
      columns: [
        { header: 'Room', key: 'roomNumber', width: 1 },
        { header: 'Building', key: 'building', width: 1.5 },
        { header: 'Capacity', key: 'capacity', width: 1, align: 'right' },
        { header: 'Occupied', key: 'occupied', width: 1, align: 'right' },
        { header: 'Available', key: 'available', width: 1, align: 'right' },
        { header: 'Status', key: 'status', width: 1.8 },
        { header: 'Rent / tenant', key: 'monthlyRent', format: 'money', width: 2 },
        { header: 'Who lives here', key: 'occupants', width: 5 },
      ],
      rows,
      summary: [
        ['Rooms', rows.length],
        ['Spaces occupied', `${occ} of ${cap}`],
        ['Occupancy rate', cap ? `${round2((occ / cap) * 100)}%` : '0%'],
      ],
    };
  },

  async 'tenant-list'(q) {
    const tenants = listOf(await col(C.tenants).get())
      .filter((t) => (q.status ? t.status === q.status : t.status === 'ACTIVE') && matches(q, t.name, t.phone, t.email, t.currentRoomNumber))
      .sort((a, b) => a.name.localeCompare(b.name));
    const unpaid = listOf(await col(C.bills).where('remainingBalance', '>', 0).get()).filter((b) => b.state === BILL_STATE.PUBLISHED);
    const rows = tenants.map((t) => ({
      name: t.name,
      room: t.currentRoomNumber ? `Room ${t.currentRoomNumber}, Bed ${t.currentBedNumber}` : '-',
      phone: t.phone || '',
      email: t.email,
      moveInDate: t.moveInDate,
      monthlyRent: t.monthlyRent || 0,
      balance: sum(unpaid.filter((b) => b.tenantId === t._id).map((b) => b.remainingBalance)),
      statusLabel: TENANT_LABEL[t.status],
    }));
    return {
      title: 'Tenant List',
      columns: [
        { header: 'Name', key: 'name', width: 3 },
        { header: 'Room', key: 'room', width: 2 },
        { header: 'Phone', key: 'phone', width: 2 },
        { header: 'Email', key: 'email', width: 3 },
        { header: 'Moved in', key: 'moveInDate', format: 'date', width: 1.5 },
        { header: 'Rent', key: 'monthlyRent', format: 'money', width: 1.5 },
        { header: 'Balance', key: 'balance', format: 'money', width: 1.5 },
        { header: 'Status', key: 'statusLabel', width: 1.2 },
      ],
      rows,
      summary: [
        ['Tenants', rows.length],
        ['Total unpaid', peso(sum(rows.map((r) => r.balance)))],
      ],
    };
  },

  async electricity(q) {
    const readings = listOf(await col(C.electricityReadings).get())
      .filter((r) => inPeriod(r, q) && matches(q, r.roomNumber))
      .sort((a, b) => a.billingYear - b.billingYear || a.billingMonth - b.billingMonth || a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
    const rows = readings.map((r) => ({
      ...r,
      period: periodLabel(r.billingYear, r.billingMonth),
      sharing: { EQUAL: 'Split equally', PRORATED: 'By days stayed', CUSTOM: 'Custom amounts', INDIVIDUAL_METER: 'Own meters' }[r.sharingMethod] || '',
      tenants: (r.shares || []).length,
      eachTenant: (r.shares || []).map((s) => `${s.tenantName}: ${peso(s.amount)}`).join(', '),
    }));
    return {
      title: 'Electricity Charges',
      columns: [
        { header: 'Month', key: 'period', width: 2 },
        { header: 'Room', key: 'roomNumber', width: 1 },
        { header: 'Previous', key: 'previousReading', width: 1, align: 'right' },
        { header: 'Current', key: 'currentReading', width: 1, align: 'right' },
        { header: 'kWh used', key: 'consumption', width: 1, align: 'right' },
        { header: 'Rate', key: 'rate', format: 'money', width: 1.5 },
        { header: 'Total', key: 'totalCost', format: 'money', width: 2 },
        { header: 'How shared', key: 'sharing', width: 1.6 },
        { header: 'Each tenant', key: 'eachTenant', width: 4 },
      ],
      rows,
      summary: [
        ['Total kWh', round2(sum(rows.map((r) => r.consumption || 0)))],
        ['Total electricity', peso(sum(rows.map((r) => r.totalCost)))],
      ],
    };
  },

  async 'tenant-statement'(q) {
    if (!q.tenantId) throw ApiError.badRequest('Please choose a tenant.');
    const tenant = toPlain(await col(C.tenants).doc(q.tenantId).get());
    if (!tenant) throw ApiError.notFound('Tenant not found');
    const bills = listOf(await col(C.bills).where('tenantId', '==', tenant._id).get()).filter((b) => b.state === BILL_STATE.PUBLISHED && inPeriod(b, q));
    const payments = listOf(await col(C.payments).where('tenantId', '==', tenant._id).get()).filter((p) => p.status === PAYMENT_STATUS.CONFIRMED && inDates(p.paymentDate, q));
    const entries = [
      ...bills.map((b) => ({ date: b.publishedAt || b.createdAt, description: `Bill for ${periodLabel(b.billingYear, b.billingMonth)}`, charge: b.totalAmount, payment: 0 })),
      ...payments.map((p) => ({ date: p.paymentDate, description: `Payment ${p.receiptNumber} (${METHOD_LABELS[p.paymentMethod]})`, charge: 0, payment: p.amount })),
    ].sort((a, b) => a.date - b.date);
    let running = 0;
    const rows = entries.map((e) => {
      running = round2(running + e.charge - e.payment);
      return { ...e, runningBalance: running };
    });
    return {
      title: `Account Statement: ${tenant.name}`,
      subtitleExtra: [tenant.currentRoomNumber && `Room ${tenant.currentRoomNumber}`, tenant.phone].filter(Boolean).join(' | '),
      columns: [
        { header: 'Date', key: 'date', format: 'date', width: 1.5 },
        { header: 'Description', key: 'description', width: 4 },
        { header: 'Charges', key: 'charge', format: 'money', width: 2 },
        { header: 'Payments', key: 'payment', format: 'money', width: 2 },
        { header: 'Balance', key: 'runningBalance', format: 'money', width: 2 },
      ],
      rows,
      summary: [
        ['Total charges', peso(sum(rows.map((r) => r.charge)))],
        ['Total payments', peso(sum(rows.map((r) => r.payment)))],
        ['Balance', peso(running)],
      ],
    };
  },
};

const REPORT_TYPES = Object.keys(builders);

function rangeText(q) {
  const parts = [];
  if (q.fromPeriod || q.toPeriod) parts.push(`Months: ${q.fromPeriod || 'start'} to ${q.toPeriod || 'now'}`);
  if (q.from || q.to) parts.push(`Dates: ${q.from || 'start'} to ${q.to || 'today'}`);
  if (q.search) parts.push(`Search: "${q.search}"`);
  return parts.join('  |  ') || 'All records';
}

async function buildReport(type, query) {
  const builder = builders[type];
  if (!builder) throw ApiError.notFound('This report does not exist.');
  const report = await builder(query);
  report.type = type;
  report.subtitle = [rangeText(query), report.subtitleExtra].filter(Boolean).join('  |  ');
  report.generatedAt = new Date();
  delete report.subtitleExtra;
  return report;
}

async function toExcel(report, settings) {
  const wb = new ExcelJS.Workbook();
  wb.creator = settings.houseName || 'Boarding House';
  const ws = wb.addWorksheet(report.title.slice(0, 31).replace(/[\\/?*[\]:]/g, '-'));
  ws.addRow([settings.houseName || 'Boarding House']).font = { bold: true, size: 14, color: { argb: 'FF1E3A8A' } };
  ws.addRow([report.title]).font = { bold: true, size: 12 };
  ws.addRow([report.subtitle]).font = { italic: true, size: 9 };
  ws.addRow([]);
  const header = ws.addRow(report.columns.map((c) => c.header));
  header.font = { bold: true, color: { argb: 'FF1E3A8A' } };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
  });
  report.rows.forEach((r) => ws.addRow(report.columns.map((c) => (c.format === 'date' ? (r[c.key] ? new Date(r[c.key]) : null) : r[c.key] ?? ''))));
  report.columns.forEach((c, i) => {
    const column = ws.getColumn(i + 1);
    column.width = Math.max(12, Math.round((c.width || 1) * 9));
    if (c.format === 'money') column.numFmt = '"₱"#,##0.00';
    if (c.format === 'date') column.numFmt = 'yyyy-mm-dd';
  });
  if (report.summary?.length) {
    ws.addRow([]);
    report.summary.forEach(([k, v]) => {
      ws.addRow([k, v]).getCell(1).font = { bold: true };
    });
  }
  return wb.xlsx.writeBuffer();
}

module.exports = { buildReport, toExcel, REPORT_TYPES };
