/**
 * Owner-facing Activity History. Turns stored activity entries into plain-language sentences.
 * Only friendly fields leave this module: never IDs, internal action names, or technical data.
 * (`link` is used by the admin app only to open the right page; it is never displayed.)
 */
const { col, C, listOf, getMany } = require('../db');
const { formatPeso } = require('../utils/money');
const { PAYMENT_STATUS } = require('../constants');

const CATEGORIES = ['payments', 'bills', 'tenants', 'rooms', 'electricity', 'announcements', 'account'];

const PAYMENT_LABEL = {
  [PAYMENT_STATUS.PENDING]: { label: 'Waiting for Verification', tone: 'amber' },
  [PAYMENT_STATUS.CONFIRMED]: { label: 'Confirmed', tone: 'green' },
  [PAYMENT_STATUS.REJECTED]: { label: 'Rejected', tone: 'red' },
  [PAYMENT_STATUS.REVERSED]: { label: 'Reversed', tone: 'slate' },
};
const DONE = { label: 'Completed', tone: 'green' };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function describe(e) {
  const d = e.details || {};
  const p = d.personName || 'A tenant';
  const amt = typeof d.amount === 'number' ? formatPeso(d.amount) : '';
  const room = d.roomNumber ? `Room ${d.roomNumber}` : 'a room';
  const period = d.period || '';
  const t = {
    'payment.submit': ['Payment Submitted', 'payment', `${p} submitted a ${amt}${d.method ? ` ${d.method}` : ''} payment.`],
    'payment.confirm': ['Payment Confirmed', 'payment-confirmed', `${p}'s payment was confirmed${amt ? ` (${amt})` : ''}.`],
    'payment.reject': ['Payment Rejected', 'payment-rejected', `${p}'s ${amt} payment was rejected.`],
    'payment.record': ['Payment Recorded', 'payment-confirmed', `A ${amt}${d.method ? ` ${d.method}` : ''} payment from ${p} was recorded.`],
    'payment.void': ['Payment Reversed', 'payment-rejected', `${p}'s ${amt} payment was reversed.`],
    'bill.generate': [
      d.count > 1 ? 'Bills Created' : 'Bill Created',
      'bill',
      d.count > 1 || !d.personName ? `${period ? `${period} bills` : 'Bills'} were created for ${plural(d.count || 0, 'tenant')}.` : `The ${period} bill for ${p} was created.`,
    ],
    'bill.publish': [
      d.count > 1 ? 'Bills Sent to Tenants' : 'Bill Sent to Tenant',
      'send',
      d.count > 1 || !d.personName ? `${plural(d.count || 0, 'bill')}${period ? ` for ${period}` : ''} ${d.count === 1 ? 'was' : 'were'} sent to tenants.` : `${p}'s ${period} bill was sent.`,
    ],
    'bill.update_draft': ['Bill Updated', 'bill', `${p}'s ${period} bill was updated.`],
    'bill.adjust': [
      d.kind === 'charge' ? 'Extra Charge Added' : 'Discount Given',
      'bill',
      d.kind === 'charge' ? `An extra charge of ${amt}${d.label ? ` (${d.label})` : ''} was added to ${p}'s ${period} bill.` : `A ${amt} discount${d.label ? ` (${d.label})` : ''} was given on ${p}'s ${period} bill.`,
    ],
    'bill.void': ['Bill Cancelled', 'cancel', `${p}'s ${period} bill was cancelled.`],
    'bill.delete_draft': ['Unsent Bill Deleted', 'cancel', `${p}'s unsent ${period} bill was deleted.`],
    'bill.remind': ['Payment Reminder Sent', 'reminder', `A payment reminder was sent to ${p}.`],
    'tenant.signup': ['New Tenant Account', 'tenant-add', `${p} registered a tenant account.`],
    'tenant.approve': ['Tenant Account Approved', 'tenant-add', `${p}'s tenant account was approved.`],
    'tenant.reject': ['Tenant Account Not Approved', 'tenant-remove', `${p}'s tenant account was not approved${d.reason ? ` (${d.reason})` : ''}.`],
    'tenant.decline': ['Sign-up Declined', 'tenant-remove', `${p}'s sign-up was declined.`],
    'tenant.create': ['Tenant Added', 'tenant-add', d.roomNumber ? `${p} was added to ${room}.` : `${p} was added as a tenant.`],
    'tenant.update': ['Tenant Details Updated', 'tenant', `${p}'s details were updated.`],
    'tenant.move_out': ['Tenant Moved Out', 'tenant-remove', `${p} moved out of the boarding house.`],
    'tenant.deactivate': ['Tenant Removed', 'tenant-remove', `${p} was removed from the boarding house.`],
    'tenant.reactivate': ['Tenant Account Restored', 'tenant', `${p}'s account was restored.`],
    'tenant.reset_password': ['New Temporary Password', 'key', `Owner created a new temporary password for ${p}.`],
    'assignment.create': ['Tenant Assigned', 'room', `${p} was assigned to ${room}.`],
    'assignment.transfer': ['Tenant Transferred', 'transfer', d.fromRoom ? `${p} was moved from Room ${d.fromRoom} to Room ${d.toRoom}.` : `${p} was moved to Room ${d.toRoom}.`],
    'room.create': ['Room Added', 'room', d.capacity ? `${room} was added with space for ${plural(d.capacity, 'tenant')}.` : `${room} was added.`],
    'room.update': ['Room Updated', 'room', `${room} information was updated${d.rentChanged ? ` (new rent ${amt})` : ''}.`],
    'room.archive': ['Room Archived', 'room', `${room} was archived and is no longer in use.`],
    'room.restore': ['Room Restored', 'room', `${room} is back in use.`],
    'electricity.create': ['Electricity Charges Recorded', 'electricity', `${period ? `${period} e` : 'E'}lectricity charges for ${room} were recorded.`],
    'electricity.update': ['Electricity Charges Updated', 'electricity', `${period ? `${period} e` : 'E'}lectricity charges for ${room} were updated.`],
    'electricity.delete': ['Electricity Charges Deleted', 'electricity', `${period ? `${period} e` : 'E'}lectricity charges for ${room} were deleted.`],
    'announcement.create': ['Announcement Sent', 'announcement', `An announcement was sent to ${d.audience || 'tenants'}${d.title ? `: "${d.title}"` : ''}.`],
    'announcement.delete': ['Announcement Deleted', 'announcement', `An announcement${d.title ? ` ("${d.title}")` : ''} was deleted.`],
    'settings.update': ['Settings Updated', 'settings', 'Boarding house settings were updated.'],
    'settings.cover': ['Boarding House Photo Updated', 'settings', d.removed ? 'The boarding house photo was removed.' : 'A new boarding house photo was uploaded.'],
    'settings.logo': ['Logo Updated', 'settings', d.removed ? 'The boarding house logo was removed.' : 'A new boarding house logo was uploaded.'],
    'auth.password_changed': ['Password Changed', 'key', `${d.personName || e.actorName || 'Someone'} changed their password.`],
    'user.create_admin': ['Administrator Added', 'tenant-add', `${d.personName || 'A new user'} was added as an administrator.`],
    'user.activate': ['Administrator Enabled', 'tenant', `${d.personName || 'An administrator'} can sign in again.`],
    'user.deactivate': ['Administrator Disabled', 'tenant-remove', `${d.personName || 'An administrator'} can no longer sign in.`],
  };
  const [title, icon, description] = t[e.action] || ['Activity', 'activity', 'A change was made.'];
  return { title, icon, description, d };
}

function linkFor(e) {
  const d = e.details || {};
  if (e.action.startsWith('payment.')) return { page: 'payment', id: e.entityId };
  if (e.action.startsWith('bill.') && e.entityId) return { page: 'bill', id: e.entityId };
  if ((e.action.startsWith('tenant.') || e.action.startsWith('assignment.')) && (d.tenantId || e.entityType === 'Tenant')) return { page: 'tenant', id: d.tenantId || e.entityId };
  if (e.entityType === 'Room') return { page: 'room', id: e.entityId };
  if (e.action.startsWith('electricity.')) return { page: 'electricity' };
  if (e.action.startsWith('announcement.')) return { page: 'announcements' };
  if (e.action.startsWith('settings.')) return { page: 'settings' };
  return undefined;
}

async function present(entries) {
  const payments = await getMany(
    C.payments,
    entries.filter((e) => e.action.startsWith('payment.')).map((e) => e.entityId)
  );
  return entries.map((e) => {
    const { title, icon, description, d } = describe(e);
    const status = e.action.startsWith('payment.') ? PAYMENT_LABEL[payments.get(e.entityId)?.status] || DONE : DONE;
    const tenantAction = /^(payment|tenant|assignment)\./.test(e.action) || ['bill.update_draft', 'bill.adjust', 'bill.void', 'bill.delete_draft', 'bill.remind'].includes(e.action);
    return {
      key: e._id,
      title,
      icon,
      description,
      person: (tenantAction || d.personName ? d.personName : null) || e.actorName || 'System',
      doneBy: e.actorName || 'System (automatic)',
      amount: typeof d.amount === 'number' ? d.amount : undefined,
      reference: d.reference || d.receiptNumber || undefined,
      roomNumber: d.roomNumber || d.toRoom || undefined,
      period: d.period || undefined,
      reason: e.reason || undefined,
      status,
      createdAt: e.createdAt,
      link: linkFor(e),
    };
  });
}

/**
 * Lists activity, newest first. Search is done over the most recent entries
 * (Firestore has no text search), which is plenty for a boarding house.
 */
async function listActivity({ category, search, from, to, page, limit, skip }) {
  let q = col(C.activityHistory);
  if (category && CATEGORIES.includes(category)) q = q.where('category', '==', category);
  q = q.orderBy('createdAt', 'desc');
  if (from) q = q.where('createdAt', '>=', new Date(`${from}T00:00:00+08:00`));
  if (to) q = q.where('createdAt', '<=', new Date(`${to}T23:59:59.999+08:00`));

  if (search) {
    const term = search.toLowerCase();
    const recent = listOf(await q.limit(1000).get());
    const matches = recent.filter((e) =>
      [e.summary, e.actorName, e.details?.personName, e.details?.roomNumber, e.details?.title, e.details?.reference].some((v) => v && String(v).toLowerCase().includes(term))
    );
    return { items: await present(matches.slice(skip, skip + limit)), total: matches.length, page, limit, pages: Math.max(1, Math.ceil(matches.length / limit)) };
  }
  const [snap, count] = await Promise.all([q.offset(skip).limit(limit).get(), q.count().get()]);
  const total = count.data().count;
  return { items: await present(listOf(snap)), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

async function historyFor(entityId, limit = 30) {
  return present(listOf(await col(C.activityHistory).where('entityId', '==', entityId).orderBy('createdAt', 'desc').limit(limit).get()));
}

module.exports = { listActivity, present, historyFor, CATEGORIES };
