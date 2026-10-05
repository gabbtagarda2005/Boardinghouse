/**
 * Records important actions in `activityHistory`.
 * - `details`: plain-language facts (names, amounts, rooms) used by the owner-facing Activity History.
 * - `technical`: before/after snapshots and IP, kept for security/debugging and never shown in the apps.
 */
const { col, C, now } = require('../db');

function plain(value) {
  if (value == null) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function categoryOf(action) {
  const prefix = action.split('.')[0];
  return { assignment: 'tenants', tenant: 'tenants', payment: 'payments', bill: 'bills', room: 'rooms', electricity: 'electricity', announcement: 'announcements' }[prefix] || 'account';
}

/** Writes an activity entry. Pass `tx` to include it in a transaction. */
async function audit({ actor, req, action, entityType, entityId, summary, details, before, after, reason }, tx) {
  const ref = col(C.activityHistory).doc();
  const entry = {
    action,
    category: categoryOf(action),
    actorId: actor?.uid || actor?._id || null,
    actorName: actor?.name || 'System',
    entityType,
    entityId: entityId ? String(entityId) : null,
    summary,
    details: plain(details) || {},
    reason: reason || null,
    technical: { before: plain(before) || null, after: plain(after) || null, ip: req?.ip || null },
    createdAt: now(),
  };
  if (tx) tx.set(ref, entry);
  else await ref.set(entry);
  return ref.id;
}

module.exports = { audit, categoryOf };
