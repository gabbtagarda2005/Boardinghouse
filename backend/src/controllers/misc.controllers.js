const { col, C, toPlain, listOf, now, getMany } = require('../db');
const ApiError = require('../utils/ApiError');
const { getPagination, paged } = require('../utils/pagination');
const { notifyUsers } = require('../services/notification.service');
const { audit } = require('../services/audit.service');
const { runReminders } = require('../services/scheduler.service');
const { buildReport, toExcel } = require('../services/report.service');
const { tablePdf } = require('../services/pdf.service');
const { getSettings, updateSettings, presentSettings } = require('../services/settings.service');
const { getDashboard } = require('../services/dashboard.service');
const { listActivity } = require('../services/activity.service');
const accounts = require('../services/accounts.service');
const mail = require('../services/mail.service');
const { usingEmulators } = require('../config/firebase');
const env = require('../config/env');
const { ROLE, TENANT_STATUS, USER_STATUS } = require('../constants');

// ---------------- Notifications (own only) ----------------
const notifications = {
  async listMine(req, res) {
    const q = req.valid.query;
    const pg = getPagination(q, { defaultLimit: 30, maxLimit: 100 });
    let base = col(C.notifications).where('userId', '==', req.user.uid);
    const unreadQ = base.where('readAt', '==', null);
    if (q.unread === 'true') base = unreadQ;
    const [snap, total, unread] = await Promise.all([base.orderBy('createdAt', 'desc').offset(pg.skip).limit(pg.limit).get(), base.count().get(), unreadQ.count().get()]);
    res.json({ success: true, ...paged(listOf(snap), total.data().count, pg), unread: unread.data().count });
  },
  async markRead(req, res) {
    const ref = col(C.notifications).doc(req.params.id);
    const n = toPlain(await ref.get());
    if (!n || n.userId !== req.user.uid) throw ApiError.notFound('Notification not found');
    await ref.update({ readAt: now() });
    res.json({ success: true });
  },
  /** Remove one of your own notifications (the ✕ on a notification). */
  async remove(req, res) {
    const ref = col(C.notifications).doc(req.params.id);
    const n = toPlain(await ref.get());
    if (!n || n.userId !== req.user.uid) throw ApiError.notFound('Notification not found');
    await ref.delete();
    res.json({ success: true });
  },
  /** Clears all of the signed-in user's own notifications (tenant app: "Mark all as read"). */
  async clearMine(req, res) {
    let removed = 0;
    for (;;) {
      const snap = await col(C.notifications).where('userId', '==', req.user.uid).limit(400).get();
      if (snap.empty) break;
      const batch = col(C.notifications).firestore.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      removed += snap.size;
    }
    res.json({ success: true, removed });
  },
  async markAllRead(req, res) {
    const snap = await col(C.notifications).where('userId', '==', req.user.uid).where('readAt', '==', null).limit(500).get();
    const batch = col(C.notifications).firestore.batch();
    snap.docs.forEach((d) => batch.update(d.ref, { readAt: now() }));
    await batch.commit();
    res.json({ success: true, updated: snap.size });
  },
  async runReminders(_req, res) {
    res.json({ success: true, result: await runReminders() });
  },
};

// ---------------- Announcements ----------------
const announcements = {
  async list(req, res) {
    const pg = getPagination(req.valid?.query || {}, { defaultLimit: 20 });
    const all = listOf(await col(C.announcements).orderBy('createdAt', 'desc').limit(200).get()).sort((a, b) => Number(b.pinned) - Number(a.pinned));
    res.json({ success: true, ...paged(all.slice(pg.skip, pg.skip + pg.limit), all.length, pg) });
  },
  async create(req, res) {
    const { title, body, audience, roomIds = [], tenantIds = [], pinned } = req.body;
    let tenants = listOf(await col(C.tenants).where('status', '==', TENANT_STATUS.ACTIVE).get());
    let audienceText = 'all tenants';
    if (audience === 'ROOMS') {
      const rooms = await getMany(C.rooms, roomIds);
      tenants = tenants.filter((t) => roomIds.includes(t.currentRoomId));
      audienceText = `tenants in Room ${[...rooms.values()].map((r) => r.roomNumber).join(', ')}`;
    } else if (audience === 'TENANTS') {
      tenants = tenants.filter((t) => tenantIds.includes(t._id));
      audienceText = tenants.length === 1 ? tenants[0].name : `${tenants.length} selected tenants`;
    }
    if (!tenants.length) throw ApiError.badRequest('No active tenants match your selection.');
    const ref = col(C.announcements).doc();
    const doc = {
      title,
      body,
      audience,
      roomIds: audience === 'ROOMS' ? roomIds : [],
      recipientIds: audience === 'ALL' ? [] : tenants.map((t) => t._id),
      audienceText,
      pinned: Boolean(pinned),
      recipientCount: tenants.length,
      createdBy: req.user.uid,
      createdByName: req.user.name,
      createdAt: now(),
    };
    await ref.set(doc);
    await notifyUsers(
      tenants.map((t) => t._id),
      { type: 'announcement', title, message: body.length > 300 ? `${body.slice(0, 297)}...` : body, data: { announcementId: ref.id } }
    );
    await audit({ actor: req.user, req, action: 'announcement.create', entityType: 'Announcement', entityId: ref.id, summary: `Announcement "${title}"`, details: { title, audience: audienceText, count: tenants.length } });
    res.status(201).json({ success: true, announcement: { _id: ref.id, ...doc } });
  },
  async togglePin(req, res) {
    const ref = col(C.announcements).doc(req.params.id);
    const a = toPlain(await ref.get());
    if (!a) throw ApiError.notFound('Announcement not found');
    await ref.update({ pinned: !a.pinned });
    res.json({ success: true });
  },
  async remove(req, res) {
    const ref = col(C.announcements).doc(req.params.id);
    const a = toPlain(await ref.get());
    if (!a) throw ApiError.notFound('Announcement not found');
    await ref.delete();
    await audit({ actor: req.user, req, action: 'announcement.delete', entityType: 'Announcement', entityId: a._id, summary: `Deleted "${a.title}"`, details: { title: a.title } });
    res.json({ success: true });
  },
};

// ---------------- Reports ----------------
async function report(req, res) {
  const q = req.valid.query;
  const rep = await buildReport(req.params.type, q);
  const format = q.format || 'json';
  if (format === 'json') return res.json({ success: true, report: rep });
  const settings = await getSettings();
  const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: env.timezone }).format(new Date());
  const name = `${req.params.type}-${stamp}`;
  if (format === 'xlsx') {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`);
    return res.send(Buffer.from(await toExcel(rep, settings)));
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`);
  return res.send(await tablePdf(rep, settings));
}

// ---------------- Settings / dashboard / activity ----------------
const settings = {
  async get(_req, res) {
    res.json({ success: true, settings: presentSettings(await getSettings({ fresh: true })), features: { pushNotifications: !usingEmulators, email: mail.isConfigured(), onlinePayments: false } });
  },
  async update(req, res) {
    const before = await getSettings({ fresh: true });
    const after = await updateSettings(req.body);
    await audit({ actor: req.user, req, action: 'settings.update', entityType: 'Setting', entityId: 'global', summary: 'Updated settings', before, after });
    res.json({ success: true, settings: presentSettings(after) });
  },
};

async function dashboard(_req, res) {
  res.json({ success: true, ...(await getDashboard()) });
}

async function activity(req, res) {
  const q = req.valid.query;
  res.json({ success: true, ...(await listActivity({ ...q, ...getPagination(q, { defaultLimit: 25, maxLimit: 100 }) })) });
}

// ---------------- Admin accounts ----------------
const users = {
  async updateMe(req, res) {
    await accounts.updateProfile(req.user.uid, req.body);
    res.json({ success: true, user: toPlain(await col(C.users).doc(req.user.uid).get()) });
  },
  async listAdmins(_req, res) {
    const items = listOf(await col(C.users).where('role', '==', ROLE.ADMIN).get()).map(({ fcmTokens, ...u }) => u);
    res.json({ success: true, items });
  },
  async createAdmin(req, res) {
    const uid = await accounts.createAccount({ ...req.body, role: ROLE.ADMIN, mustChangePassword: false });
    await audit({ actor: req.user, req, action: 'user.create_admin', entityType: 'User', entityId: uid, summary: `Added administrator ${req.body.email}`, details: { personName: req.body.name } });
    res.status(201).json({ success: true });
  },
  async setActive(req, res) {
    if (req.params.id === req.user.uid) throw ApiError.badRequest('You cannot turn off your own account.');
    const u = toPlain(await col(C.users).doc(req.params.id).get());
    if (!u || u.role !== ROLE.ADMIN) throw ApiError.notFound('Administrator not found');
    if (!req.body.isActive) {
      const others = listOf(await col(C.users).where('role', '==', ROLE.ADMIN).get()).filter((x) => x._id !== u._id && x.status === USER_STATUS.ACTIVE);
      if (!others.length) throw ApiError.badRequest('At least one administrator must stay active.');
    }
    await accounts.setActive(u._id, req.body.isActive);
    await audit({ actor: req.user, req, action: req.body.isActive ? 'user.activate' : 'user.deactivate', entityType: 'User', entityId: u._id, summary: `${req.body.isActive ? 'Enabled' : 'Disabled'} ${u.email}`, details: { personName: u.name } });
    res.json({ success: true });
  },
};

module.exports = { notifications, announcements, report, settings, dashboard, activity, users };
