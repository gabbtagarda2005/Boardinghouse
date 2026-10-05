/**
 * Notifications are always saved in Firestore (so tenants have a history in the app),
 * pushed with Firebase Cloud Messaging, and sent live to open admin screens via Socket.IO.
 * Delivery problems never break the action that triggered them.
 */
const crypto = require('crypto');
const { db, col, C, now, getMany } = require('../db');
const { messaging, usingEmulators } = require('../config/firebase');
const { getSettings } = require('./settings.service');
const { ROLE, USER_STATUS } = require('../constants');

let io = null;
const setIO = (server) => {
  io = server;
};
const emitToUser = (uid, event, payload) => io && io.to(`user:${uid}`).emit(event, payload);
const emitToAdmins = (event, payload) => io && io.to(`role:${ROLE.ADMIN}`).emit(event, payload);

async function push(userIds, byUser) {
  if (usingEmulators) return; // Cloud Messaging has no local emulator
  const settings = await getSettings();
  if (!settings.notifications.pushEnabled) return;
  const users = await getMany(C.users, userIds);
  await Promise.all(
    [...users.values()].map(async (u) => {
      const n = byUser.get(u._id);
      if (!n || !u.fcmTokens?.length) return;
      try {
        const res = await messaging().sendEachForMulticast({
          tokens: u.fcmTokens,
          notification: { title: n.title, body: n.message },
          data: Object.fromEntries(Object.entries({ type: n.type, notificationId: n.id, ...n.data }).map(([k, v]) => [k, String(v)])),
          android: { priority: 'high', notification: { channelId: 'boarding_house_default' } },
        });
        const invalid = res.responses
          .map((r, i) => (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(r.error?.code) ? u.fcmTokens[i] : null))
          .filter(Boolean);
        if (invalid.length) {
          const { FieldValue } = require('../config/firebase'); // eslint-disable-line global-require
          await col(C.users).doc(u._id).update({ fcmTokens: FieldValue.arrayRemove(...invalid) });
        }
        if (res.successCount) await col(C.notifications).doc(n.id).update({ pushSent: true });
      } catch (err) {
        console.warn('[push] failed:', err.message);
      }
    })
  );
}

/**
 * Creates one notification per user. With `dedupeKey`, a notification is created at most once
 * per user per key (used for automatic reminders).
 */
async function notifyUsers(userIds, { type = 'general', title, message, data = {}, dedupeKey }) {
  const ids = [...new Set(userIds.filter(Boolean).map(String))];
  if (!ids.length) return [];
  const created = [];
  await Promise.all(
    ids.map(async (userId) => {
      const ref = dedupeKey
        ? col(C.notifications).doc(crypto.createHash('sha1').update(`${dedupeKey}:${userId}`).digest('hex'))
        : col(C.notifications).doc();
      const doc = { userId, type, title, message, data, readAt: null, pushSent: false, createdAt: now() };
      try {
        await ref.create(doc); // fails if this reminder was already sent
        created.push({ id: ref.id, ...doc });
      } catch (err) {
        if (err.code !== 6) console.warn('[notify] could not save notification:', err.message); // 6 = ALREADY_EXISTS
      }
    })
  );
  created.forEach((n) => emitToUser(n.userId, 'notification', { _id: n.id, ...n }));
  push(
    created.map((n) => n.userId),
    new Map(created.map((n) => [n.userId, n]))
  ).catch((err) => console.warn('[push]', err.message));
  return created;
}

async function notifyAdmins(payload) {
  const snap = await col(C.users).where('role', '==', ROLE.ADMIN).get();
  const ids = snap.docs.filter((d) => d.data().status === USER_STATUS.ACTIVE).map((d) => d.id);
  return notifyUsers(ids, payload);
}

module.exports = { setIO, notifyUsers, notifyAdmins, emitToUser, emitToAdmins, db };
