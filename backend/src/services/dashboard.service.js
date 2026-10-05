const { col, C, listOf } = require('../db');
const { round2, sum } = require('../utils/money');
const { periodLabel, MONTHS } = require('../utils/dates');
const { present } = require('./activity.service');
const { BILL_STATE, BILL_STATUS, PAYMENT_STATUS, TENANT_STATUS, ROOM_STATUS } = require('../constants');

const DAY = 86400000;

function manilaNow() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return { year: Number(parts.find((p) => p.type === 'year').value), month: Number(parts.find((p) => p.type === 'month').value) };
}

/** Start of a Manila calendar month as a Date. */
const manilaMonthStart = (y, m) => new Date(Date.UTC(y, m - 1, 1) - 8 * 3600000);

/**
 * Everything the owner sees on the dashboard, computed from live Firestore data.
 * Reads are bounded: rooms, the current month's bills, unpaid bills, and recent payments.
 */
async function getDashboard() {
  const at = new Date();
  const cur = manilaNow();
  const first = (() => {
    const d = new Date(Date.UTC(cur.year, cur.month - 6, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  })();

  const [roomsSnap, activeTenantsCount, unpaidSnap, pendingSnap, recentBillsSnap, paymentsSnap, readingsSnap, activitySnap] = await Promise.all([
    col(C.rooms).where('isArchived', '==', false).get(),
    col(C.tenants).where('status', '==', TENANT_STATUS.ACTIVE).count().get(),
    col(C.bills).where('remainingBalance', '>', 0).get(),
    col(C.payments).where('status', '==', PAYMENT_STATUS.PENDING).get(),
    col(C.bills).where('billingYear', '>=', first.year).get(),
    col(C.payments).where('paymentDate', '>=', manilaMonthStart(first.year, first.month)).get(),
    col(C.electricityReadings).where('billingYear', '==', cur.year).where('billingMonth', '==', cur.month).get(),
    col(C.activityHistory).orderBy('createdAt', 'desc').limit(6).get(),
  ]);

  const rooms = listOf(roomsSnap);
  const capacity = sum(rooms.map((r) => r.capacity));
  const occupied = sum(rooms.map((r) => r.occupiedBeds || 0));
  const usable = rooms.filter((r) => !r.underMaintenance);
  const available = sum(usable.map((r) => Math.max(0, r.capacity - (r.occupiedBeds || 0))));
  const roomsWithSpace = usable.filter((r) => r.capacity > (r.occupiedBeds || 0));

  const unpaid = listOf(unpaidSnap).filter((b) => b.state === BILL_STATE.PUBLISHED);
  const overdue = unpaid.filter((b) => b.dueDate < at);
  const dueSoon = unpaid.filter((b) => b.dueDate >= at && b.dueDate - at <= 3 * DAY);
  const dueThisWeek = unpaid.filter((b) => b.dueDate >= at && b.dueDate - at <= 7 * DAY).sort((a, b) => a.dueDate - b.dueDate);

  const recentBills = listOf(recentBillsSnap).filter((b) => b.state !== BILL_STATE.VOID && (b.billingYear > first.year || b.billingMonth >= first.month));
  const monthBills = recentBills.filter((b) => b.billingYear === cur.year && b.billingMonth === cur.month);
  const monthSent = monthBills.filter((b) => b.state === BILL_STATE.PUBLISHED);
  const monthDrafts = monthBills.filter((b) => b.state === BILL_STATE.DRAFT);

  const payments = listOf(paymentsSnap).filter((p) => p.status === PAYMENT_STATUS.CONFIRMED);
  const monthStart = manilaMonthStart(cur.year, cur.month);
  const collectedThisMonth = sum(payments.filter((p) => p.paymentDate >= monthStart).map((p) => p.amount));

  const series = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(cur.year, cur.month - 1 - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const startM = manilaMonthStart(y, m);
    const endM = manilaMonthStart(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1);
    series.push({
      label: `${MONTHS[m - 1].slice(0, 3)} ${String(y).slice(2)}`,
      year: y,
      month: m,
      billed: sum(recentBills.filter((b) => b.state === BILL_STATE.PUBLISHED && b.billingYear === y && b.billingMonth === m).map((b) => b.totalAmount)),
      collected: sum(payments.filter((p) => p.paymentDate >= startM && p.paymentDate < endM).map((p) => p.amount)),
    });
  }

  const pending = listOf(pendingSnap).sort((a, b) => b.submittedAt - a.submittedAt);
  const overdueTenants = new Set(overdue.map((b) => b.tenantId));
  const occupiedRooms = rooms.filter((r) => (r.occupiedBeds || 0) > 0);
  const readingRooms = new Set(listOf(readingsSnap).map((r) => r.roomId));
  const missingReadings = occupiedRooms.filter((r) => !readingRooms.has(r._id));

  // "What needs your attention": only items that need action, most urgent first.
  const attention = [];
  const signups = (await col(C.tenants).where('status', '==', 'PENDING').count().get()).data().count;
  const newInquiries = (await col(C.inquiries).where('status', '==', 'NEW').count().get()).data().count;
  if (signups) attention.push({ key: 'signups', tone: 'amber', text: `${signups} tenant account${signups > 1 ? 's' : ''} waiting for approval`, action: 'Review', to: '/tenants?view=signups' });
  if (pending.length) attention.push({ key: 'pending', tone: 'amber', text: `${pending.length} payment${pending.length > 1 ? 's' : ''} waiting for verification`, action: 'Review', to: '/payments?tab=verify' });
  if (newInquiries) attention.push({ key: 'inquiries', tone: 'blue', text: `${newInquiries} new room inquir${newInquiries > 1 ? 'ies' : 'y'}`, action: 'View Inquiries', to: '/inquiries' });
  if (overdueTenants.size) attention.push({ key: 'overdue', tone: 'red', text: `${overdueTenants.size} overdue payment${overdueTenants.size > 1 ? 's' : ''}`, action: 'View', to: '/payments?tab=overdue' });
  if (dueSoon.length) attention.push({ key: 'due', tone: 'orange', text: `${dueSoon.length} bill${dueSoon.length > 1 ? 's' : ''} due soon`, action: 'View Bills', to: '/bills?status=UNPAID' });
  if (monthDrafts.length) attention.push({ key: 'drafts', tone: 'blue', text: `${monthDrafts.length} ${periodLabel(cur.year, cur.month)} bill${monthDrafts.length > 1 ? 's have' : ' has'} not been sent to tenants`, action: 'Send Bills', to: '/bills' });
  if (missingReadings.length) attention.push({ key: 'readings', tone: 'blue', text: `${missingReadings.length} room${missingReadings.length > 1 ? 's need' : ' needs'} this month's electricity reading`, action: 'Record Readings', to: '/electricity' });
  if (roomsWithSpace.length) attention.push({ key: 'rooms', tone: 'blue', text: `${roomsWithSpace.length} room${roomsWithSpace.length > 1 ? 's have' : ' has'} available spaces`, action: 'View Rooms', to: '/rooms?filter=available' });

  return {
    period: { ...cur, label: periodLabel(cur.year, cur.month) },
    cards: {
      totalRooms: rooms.length,
      occupiedSpaces: occupied,
      totalSpaces: capacity,
      availableSpaces: available,
      activeTenants: activeTenantsCount.data().count,
      unpaidAmount: round2(sum(unpaid.map((b) => b.remainingBalance))),
      unpaidCount: unpaid.length,
      overdueAmount: round2(sum(overdue.map((b) => b.remainingBalance))),
      overdueCount: overdue.length,
      collectedThisMonth: round2(collectedThisMonth),
    },
    attention,
    collection: {
      billedThisMonth: round2(sum(monthSent.map((b) => b.totalAmount))),
      paidThisMonth: round2(sum(monthSent.map((b) => b.amountPaid))),
      sentBills: monthSent.length,
      paidBills: monthSent.filter((b) => b.status === BILL_STATUS.PAID).length,
      series,
    },
    dueSoon: dueThisWeek.slice(0, 6).map((b) => ({ _id: b._id, tenantName: b.tenantName, roomNumber: b.roomNumber, remainingBalance: b.remainingBalance, dueDate: b.dueDate, status: b.status })),
    pendingPayments: pending.slice(0, 5).map((p) => ({ _id: p._id, tenantName: p.tenantName, amount: p.amount, paymentMethod: p.paymentMethod, submittedAt: p.submittedAt })),
    recentPayments: payments
      .sort((a, b) => (b.verifiedAt || 0) - (a.verifiedAt || 0))
      .slice(0, 5)
      .map((p) => ({ _id: p._id, tenantName: p.tenantName, amount: p.amount, paymentMethod: p.paymentMethod, paymentDate: p.paymentDate })),
    recentActivity: await present(listOf(activitySnap)),
    occupancy: rooms
      .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }))
      .map((r) => ({ _id: r._id, roomNumber: r.roomNumber, capacity: r.capacity, occupiedBeds: r.occupiedBeds || 0, status: r.status || ROOM_STATUS.AVAILABLE })),
  };
}

module.exports = { getDashboard, manilaNow, manilaMonthStart };
