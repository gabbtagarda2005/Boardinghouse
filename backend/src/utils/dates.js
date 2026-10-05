const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function periodKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function periodLabel(year, month) {
  return `${MONTHS[month - 1]} ${year}`;
}

/** First instant of the month and first instant of the following month (UTC). */
function monthRange(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Due date for a billing period using the configured day (clamped to month length). */
function dueDateFor(year, month, dueDay) {
  const day = Math.min(Math.max(1, dueDay || 5), daysInMonth(year, month));
  return new Date(Date.UTC(year, month - 1, day, 15, 59, 59)); // 23:59:59 Asia/Manila
}

/** Number of days in [from, to) overlapping the billing month. */
function overlapDays(year, month, from, to) {
  const { start, end } = monthRange(year, month);
  const s = Math.max(start.getTime(), new Date(from).getTime());
  const e = Math.min(end.getTime(), to ? new Date(to).getTime() : end.getTime());
  if (e <= s) return 0;
  return Math.ceil((e - s) / 86400000);
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

module.exports = { MONTHS, periodKey, periodLabel, monthRange, daysInMonth, dueDateFor, overlapDays, startOfDay };
