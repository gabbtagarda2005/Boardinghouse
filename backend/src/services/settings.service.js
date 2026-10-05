const { col, C, toPlain, now } = require('../db');

const DEFAULTS = {
  houseName: 'My Boarding House',
  address: '',
  contactPhone: '',
  contactEmail: '',
  defaultDueDay: 5,
  electricityRate: 12,
  defaultElectricitySharing: 'EQUAL',
  waterEnabled: false,
  waterChargePerTenant: 0,
  defaultOtherCharges: [],
  paymentInstructions:
    'Pay at the office or through the accounts below, then send your reference number and a photo of your receipt in the app. The owner confirms each payment.',
  paymentChannels: [],
  tenantAppUrl: '',
  tempPasswordDays: 3,
  allowWaitlistInquiries: false,
  notifications: {
    notifyOnBillPublish: true,
    notifyOnPaymentConfirm: true,
    sendDueReminders: true,
    reminderDaysBefore: [3, 1],
    sendOverdueReminders: true,
    overdueReminderEveryDays: 3,
    pushEnabled: true,
    emailNewTenants: true,
  },
};

const ref = () => col(C.settings).doc('global');
let cache = null;
let cachedAt = 0;

/** Settings with defaults filled in. Cached briefly to save Firestore reads. */
async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < 30000) return cache;
  const doc = toPlain(await ref().get()) || {};
  cache = { ...DEFAULTS, ...doc, notifications: { ...DEFAULTS.notifications, ...(doc.notifications || {}) } };
  cachedAt = Date.now();
  return cache;
}

async function updateSettings(changes) {
  const current = await getSettings({ fresh: true });
  const next = { ...changes, updatedAt: now() };
  if (changes.notifications) next.notifications = { ...current.notifications, ...changes.notifications };
  await ref().set(next, { merge: true });
  cache = null;
  return getSettings({ fresh: true });
}

/** Public URL of the logo (versioned so a new upload shows right away), or null. */
function logoUrl(s) {
  return s?.logo?.path ? `/api/v1/files/branding/logo?v=${s.logo.updatedAt || 0}` : null;
}

/** Public URL of the boarding-house cover photo (Settings), or null. */
function coverUrl(s) {
  return s?.coverPhoto?.path ? `/api/v1/files/branding/cover?v=${s.coverPhoto.updatedAt || 0}` : null;
}

/** Settings as sent to the admin web: storage paths are replaced by URLs. */
function presentSettings(s) {
  const { logo, coverPhoto, ...rest } = s;
  return { ...rest, logoUrl: logoUrl({ logo }), coverUrl: coverUrl({ coverPhoto }) };
}

function resetSettingsCache() {
  cache = null;
}

module.exports = { getSettings, updateSettings, resetSettingsCache, logoUrl, coverUrl, presentSettings, DEFAULTS };
