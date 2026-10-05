/**
 * Room inquiries from people who don't live here yet (e.g. students looking for a room).
 * Public form (no account); the owner follows them up in the admin.
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const { col, C, toPlain, listOf, now } = require('../db');
const { notifyAdmins, emitToAdmins } = require('../services/notification.service');
const { getSettings } = require('../services/settings.service');

const STATUS = { NEW: 'NEW', CONTACTED: 'CONTACTED', RESERVED: 'RESERVED', CLOSED: 'CLOSED' };

// Simple spam guard: at most 5 inquiries per hour from the same address.
const recent = new Map();
function tooMany(ip) {
  const hour = Date.now() - 3600000;
  const list = (recent.get(ip) || []).filter((t) => t > hour);
  list.push(Date.now());
  recent.set(ip, list);
  return list.length > 5;
}

async function create(req, res) {
  // Honeypot: a hidden field people never see. Bots that fill it get a normal-looking reply, nothing is saved.
  if (req.body.website) return res.status(201).json({ success: true, message: 'Thank you! The owner will contact you soon.' });
  if (tooMany(req.ip)) throw ApiError.tooMany('You already sent a few inquiries. Please wait a while or call the owner.');
  const b = req.body;
  // A chosen room must exist, be open, and have space for everyone (unless the owner allows a waiting list).
  let room = null;
  if (b.roomId) {
    room = toPlain(await col(C.rooms).doc(b.roomId).get());
    if (!room || room.isArchived) throw ApiError.notFound('This room is no longer listed. Please choose another room.');
    const s = await getSettings();
    const free = room.underMaintenance ? 0 : Math.max(0, room.capacity - (room.occupiedBeds || 0));
    if (room.underMaintenance || room.status === 'MAINTENANCE') throw ApiError.conflict(`Room ${room.roomNumber} is temporarily unavailable. Please choose another room.`);
    if (!s.allowWaitlistInquiries && free < b.numberOfOccupants) {
      throw ApiError.conflict(free === 0 ? `Room ${room.roomNumber} is fully occupied. Please choose another room.` : `Room ${room.roomNumber} has space for only ${free} more ${free === 1 ? 'person' : 'people'}.`);
    }
  }
  const doc = {
    roomId: room?._id || null,
    roomNumber: room?.roomNumber || null,
    preferredMoveInDate: b.preferredMoveInDate || null,
    numberOfOccupants: b.numberOfOccupants || null,
    name: b.name,
    phone: b.phone,
    email: b.email || null,
    school: b.school || null,
    moveIn: b.moveIn || null,
    roomType: b.roomType || null,
    message: b.message || null,
    status: STATUS.NEW,
    createdAt: now(),
    updatedAt: now(),
  };
  const ref = await col(C.inquiries).add(doc);
  await notifyAdmins({ type: 'inquiry', title: 'New Room Inquiry', message: room ? `${b.name} is interested in Room ${room.roomNumber}.` : `${b.name}${b.school ? ` (${b.school})` : ''} is asking about a room.`, data: { inquiryId: ref.id } }).catch(() => {});
  emitToAdmins('inquiry:new', { inquiryId: ref.id });
  res.status(201).json({ success: true, message: 'Thank you! The owner will contact you soon.' });
}

async function list(req, res) {
  const status = req.valid.query.status;
  let items = listOf(await col(C.inquiries).orderBy('createdAt', 'desc').limit(200).get());
  if (status && status !== 'ALL') items = items.filter((i) => i.status === status);
  const counts = { NEW: 0, CONTACTED: 0, RESERVED: 0, CLOSED: 0 };
  for (const i of listOf(await col(C.inquiries).select('status').get())) counts[i.status] = (counts[i.status] || 0) + 1;
  res.json({ success: true, items, counts });
}

/** Just the number of new inquiries (for the menu badge). */
async function newCount(_req, res) {
  const snap = await col(C.inquiries).where('status', '==', STATUS.NEW).count().get();
  res.json({ success: true, count: snap.data().count });
}

async function update(req, res) {
  const ref = col(C.inquiries).doc(req.params.id);
  if (!toPlain(await ref.get())) throw ApiError.notFound('Inquiry not found');
  await ref.update({ ...req.body, updatedAt: now(), handledBy: req.user.uid });
  res.json({ success: true, inquiry: toPlain(await ref.get()) });
}

async function remove(req, res) {
  await col(C.inquiries).doc(req.params.id).delete();
  res.json({ success: true });
}

// ---------------- Tenant app download link ----------------
const WEB_DIR = path.join(__dirname, '..', '..', '..', 'tenant-mobile', 'build', 'web');

/** This computer's address on the local network (what phones on the same Wi-Fi can reach). */
function lanAddress() {
  const all = Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal);
  const pick = all.find((n) => /^192\.168\./.test(n.address)) || all.find((n) => /^10\./.test(n.address)) || all.find((n) => /^172\.(1[6-9]|2\d|3[01])\./.test(n.address)) || all[0];
  return pick?.address || 'localhost';
}

async function appInfo(_req, res) {
  const s = await getSettings();
  const custom = s.tenantAppUrl || env.tenantAppUrl;
  if (custom) return res.json({ success: true, url: custom, custom: true, available: true });
  // Development only: phones on the same Wi-Fi open this computer's copy of the app.
  if (env.isProd) return res.json({ success: true, url: '', custom: false, available: false });
  const local = `http://${lanAddress()}:${env.port}/app/`;
  res.json({ success: true, url: local, localUrl: local, custom: false, available: fs.existsSync(path.join(WEB_DIR, 'index.html')) });
}

module.exports = { create, list, newCount, update, remove, appInfo, WEB_DIR, STATUS };
