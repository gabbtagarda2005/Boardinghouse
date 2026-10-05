const cron = require('node-cron');
const env = require('../config/env');
const { col, C, listOf } = require('../db');
const { refreshOverdue } = require('./billing.service');
const { notifyUsers } = require('./notification.service');
const { getSettings } = require('./settings.service');
const { periodLabel } = require('../utils/dates');
const { formatPeso } = require('../utils/money');
const { BILL_STATE } = require('../constants');

const DAY = 86400000;

/** Calendar-day difference in Manila time (positive = due date is in the future). */
function daysUntil(due, at = new Date()) {
  const fmt = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: env.timezone }).format(d);
  return Math.round((Date.parse(fmt(new Date(due))) - Date.parse(fmt(at))) / DAY);
}

/**
 * Marks overdue bills and sends "due soon" and "overdue" reminders.
 * Each reminder is sent at most once (dedupe key), so running twice a day is safe.
 */
async function runReminders(at = new Date()) {
  const settings = await getSettings({ fresh: true });
  const overdueMarked = await refreshOverdue(at);
  let dueSoon = 0;
  let overdue = 0;
  const bills = listOf(await col(C.bills).where('remainingBalance', '>', 0).get()).filter((b) => b.state === BILL_STATE.PUBLISHED);
  for (const bill of bills) {
    const days = daysUntil(bill.dueDate, at);
    const label = periodLabel(bill.billingYear, bill.billingMonth);
    if (settings.notifications.sendDueReminders && days >= 0 && settings.notifications.reminderDaysBefore.includes(days)) {
      const due = new Date(bill.dueDate).toLocaleDateString('en-PH', { timeZone: env.timezone, month: 'long', day: 'numeric', year: 'numeric' });
      dueSoon += (
        await notifyUsers([bill.tenantId], {
          type: 'due_reminder',
          title: days === 0 ? 'Payment due today' : 'Payment reminder',
          message: `Your ${label} bill of ${formatPeso(bill.remainingBalance)} is due ${days === 0 ? 'today' : `on ${due}`}.`,
          data: { billId: bill._id },
          dedupeKey: `due-${days}d:${bill._id}`,
        })
      ).length;
    }
    if (settings.notifications.sendOverdueReminders && days < 0) {
      const late = -days;
      if (late === 1 || late % (settings.notifications.overdueReminderEveryDays || 3) === 0) {
        overdue += (
          await notifyUsers([bill.tenantId], {
            type: 'overdue',
            title: 'Overdue bill',
            message: `Your ${label} bill is ${late} day${late > 1 ? 's' : ''} late. Remaining balance: ${formatPeso(bill.remainingBalance)}.`,
            data: { billId: bill._id },
            dedupeKey: `overdue-${late}d:${bill._id}`,
          })
        ).length;
      }
    }
  }
  return { overdueMarked, dueSoon, overdue };
}

/** Temporary passwords that ran out are replaced with an unknown secret (the owner gives a new one if needed). */
async function expireTemporaryPasswords() {
  const { db } = require('../config/firebase');
  const { expireTemporaryPassword } = require('./accounts.service');
  const snap = await db.collection('users').where('mustChangePassword', '==', true).get();
  let expired = 0;
  for (const d of snap.docs) {
    const at = d.data().tempPasswordExpiresAt;
    const when = at?.toDate ? at.toDate() : at ? new Date(at) : null;
    if (when && when < new Date()) {
      await expireTemporaryPassword(d.id).catch(() => {});
      expired += 1;
    }
  }
  return expired;
}

let task = null;
function startScheduler() {
  if (task || !cron.validate(env.reminderCron)) return task;
  task = cron.schedule(
    env.reminderCron,
    () => {
      runReminders().then((r) => console.log('[scheduler] reminders', r)).catch((e) => console.error('[scheduler]', e));
      expireTemporaryPasswords().catch((e) => console.error('[scheduler] passwords', e.message));
    },
    { timezone: env.timezone }
  );
  setTimeout(() => refreshOverdue().catch(() => {}), 5000).unref();
  return task;
}

module.exports = { runReminders, startScheduler, daysUntil, expireTemporaryPasswords };
