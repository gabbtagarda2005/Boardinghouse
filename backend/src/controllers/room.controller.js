const crypto = require('crypto');
const { db, col, C, toPlain, listOf, now, readUnique, claimUnique, releaseUnique } = require('../db');
const ApiError = require('../utils/ApiError');
const { audit } = require('../services/audit.service');
const { statusFor, recomputeRoom } = require('../services/occupancy.service');
const { saveFile, streamFile, deleteFile, newFileName } = require('../services/storage.service');
const { ASSIGNMENT_STATUS } = require('../constants');

const roomKey = (n) => `room:${String(n).trim().toLowerCase()}`;

/** Adds friendly computed values and photo URLs (storage paths are never sent). */
function presentRoom(r) {
  const occupied = r.occupiedBeds || 0;
  return {
    ...r,
    photos: (r.photos || []).map((p) => ({ _id: p.id, url: `/api/v1/files/rooms/${r._id}/${p.id}` })),
    occupiedBeds: occupied,
    availableBeds: r.underMaintenance ? 0 : Math.max(0, r.capacity - occupied),
  };
}

/** What the public sees: Space Available / Limited Spaces / Fully Occupied / Temporarily Unavailable. */
function publicStatus(r) {
  if (r.underMaintenance || r.status === 'MAINTENANCE') return 'UNAVAILABLE';
  const free = Math.max(0, r.capacity - (r.occupiedBeds || 0));
  if (free === 0) return 'FULL';
  return (r.occupiedBeds || 0) === 0 ? 'AVAILABLE' : 'LIMITED';
}

/** Only room facts. Never who lives there, their contacts, bills or payments. */
function publicRoom(r, allowWaitlist) {
  const p = presentRoom(r);
  const status = publicStatus(p);
  return {
    _id: p._id,
    roomNumber: p.roomNumber,
    name: p.name || null,
    building: p.building || null,
    capacity: p.capacity,
    occupiedBeds: p.occupiedBeds,
    availableBeds: p.availableBeds,
    monthlyRent: p.monthlyRent,
    amenities: p.amenities || [],
    description: p.description || null,
    photos: p.photos.map((x) => ({ url: x.url })),
    status,
    acceptingInquiries: status === 'AVAILABLE' || status === 'LIMITED' || (status === 'FULL' && allowWaitlist),
  };
}

/** Public: rooms in use, with live availability (counts come from the current room assignments). */
async function publicList(_req, res) {
  const { getSettings } = require('../services/settings.service');
  const s = await getSettings();
  const rooms = listOf(await col(C.rooms).get())
    .filter((r) => !r.isArchived)
    .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, rooms: rooms.map((r) => publicRoom(r, s.allowWaitlistInquiries)) });
}

async function publicOne(req, res) {
  const { getSettings } = require('../services/settings.service');
  const r = toPlain(await col(C.rooms).doc(req.params.id).get());
  if (!r || r.isArchived) throw ApiError.notFound('This room is not available.');
  const s = await getSettings();
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, room: publicRoom(r, s.allowWaitlistInquiries) });
}

async function list(req, res) {
  const q = req.valid.query;
  let rooms = listOf(await col(C.rooms).get());
  if (q.archived === 'true') rooms = rooms.filter((r) => r.isArchived);
  else if (q.archived !== 'all') rooms = rooms.filter((r) => !r.isArchived);
  if (q.status) rooms = rooms.filter((r) => r.status === q.status);
  if (q.search) {
    const t = q.search.toLowerCase();
    rooms = rooms.filter((r) => [r.roomNumber, r.name, r.building].some((v) => v && v.toLowerCase().includes(t)));
  }
  rooms.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
  // Who lives in each room (for room cards).
  const active = listOf(await col(C.roomAssignments).where('status', '==', ASSIGNMENT_STATUS.ACTIVE).get());
  const items = rooms.map((r) => ({
    ...presentRoom(r),
    occupants: active
      .filter((a) => a.roomId === r._id)
      .sort((a, b) => a.bedNumber - b.bedNumber)
      .map((a) => ({ tenantId: a.tenantId, name: a.tenantName, bedNumber: a.bedNumber })),
  }));
  res.json({ success: true, items, total: items.length, page: 1, pages: 1 });
}

async function get(req, res) {
  const room = toPlain(await col(C.rooms).doc(req.params.id).get());
  if (!room) throw ApiError.notFound('Room not found');
  const all = listOf(await col(C.roomAssignments).where('roomId', '==', room._id).get());
  const occupants = all.filter((a) => a.status === ASSIGNMENT_STATUS.ACTIVE).sort((a, b) => a.bedNumber - b.bedNumber);
  const history = all
    .filter((a) => a.status === ASSIGNMENT_STATUS.ENDED)
    .sort((a, b) => b.endDate - a.endDate)
    .slice(0, 20);
  const beds = Array.from({ length: room.capacity }, (_, i) => {
    const a = occupants.find((o) => o.bedNumber === i + 1);
    return { bedNumber: i + 1, occupied: Boolean(a), tenantId: a?.tenantId || null, tenantName: a?.tenantName || null, since: a?.startDate || null, monthlyRent: a?.monthlyRent ?? null };
  });
  res.json({ success: true, room: presentRoom(room), beds, history: history.map((h) => ({ _id: h._id, tenantId: h.tenantId, tenantName: h.tenantName, bedNumber: h.bedNumber, startDate: h.startDate, endDate: h.endDate, endReason: h.endReason })) });
}

async function create(req, res) {
  const ref = col(C.rooms).doc();
  const room = {
    ...req.body,
    roomNumber: req.body.roomNumber.trim(),
    amenities: req.body.amenities || [],
    underMaintenance: Boolean(req.body.underMaintenance),
    occupiedBeds: 0,
    photos: [],
    isArchived: false,
    createdAt: now(),
    updatedAt: now(),
  };
  room.status = statusFor(room);
  await db.runTransaction(async (tx) => {
    const lock = await readUnique(tx, roomKey(room.roomNumber));
    claimUnique(tx, lock, ref.id, `Room ${room.roomNumber} already exists.`);
    tx.set(ref, room);
    await audit(
      { actor: req.user, req, action: 'room.create', entityType: 'Room', entityId: ref.id, summary: `Added room ${room.roomNumber}`, details: { roomNumber: room.roomNumber, capacity: room.capacity, amount: room.monthlyRent }, after: room },
      tx
    );
  });
  res.status(201).json({ success: true, room: presentRoom({ _id: ref.id, ...room }) });
}

async function update(req, res) {
  const ref = col(C.rooms).doc(req.params.id);
  const result = await db.runTransaction(async (tx) => {
    const room = toPlain(await tx.get(ref));
    if (!room) throw ApiError.notFound('Room not found');
    const active = listOf(await tx.get(col(C.roomAssignments).where('roomId', '==', room._id).where('status', '==', ASSIGNMENT_STATUS.ACTIVE)));
    const renamed = req.body.roomNumber && req.body.roomNumber.trim().toLowerCase() !== room.roomNumber.toLowerCase();
    const newLock = renamed ? await readUnique(tx, roomKey(req.body.roomNumber)) : null;
    if (req.body.capacity !== undefined && req.body.capacity < room.capacity) {
      if (active.length > req.body.capacity) throw ApiError.badRequest(`${active.length} tenants live in this room, so it needs at least ${active.length} beds.`);
      const high = active.filter((a) => a.bedNumber > req.body.capacity);
      if (high.length) throw ApiError.badRequest(`Bed ${high.map((a) => a.bedNumber).join(', ')} is still taken. Move those tenants to another bed first.`);
    }
    const next = { ...room, ...req.body, occupiedBeds: active.length, updatedAt: now() };
    if (renamed) {
      next.roomNumber = req.body.roomNumber.trim();
      claimUnique(tx, newLock, room._id, `Room ${next.roomNumber} already exists.`);
      releaseUnique(tx, roomKey(room.roomNumber));
    }
    next.status = statusFor(next);
    const { _id, ...write } = next;
    tx.set(ref, write);
    await audit(
      {
        actor: req.user,
        req,
        action: 'room.update',
        entityType: 'Room',
        entityId: room._id,
        summary: `Updated room ${next.roomNumber}`,
        details: { roomNumber: next.roomNumber, rentChanged: room.monthlyRent !== next.monthlyRent, amount: next.monthlyRent },
        before: room,
        after: next,
      },
      tx
    );
    return next;
  });
  res.json({ success: true, room: presentRoom(result) });
}

async function setArchived(req, res, archived) {
  const room = toPlain(await col(C.rooms).doc(req.params.id).get());
  if (!room) throw ApiError.notFound('Room not found');
  if (archived && (room.occupiedBeds || 0) > 0) throw ApiError.badRequest('Move out or transfer everyone in this room before archiving it.');
  await col(C.rooms).doc(room._id).update({ isArchived: archived, archivedAt: archived ? now() : null, updatedAt: now() });
  await audit({ actor: req.user, req, action: archived ? 'room.archive' : 'room.restore', entityType: 'Room', entityId: room._id, summary: `${archived ? 'Archived' : 'Restored'} room ${room.roomNumber}`, details: { roomNumber: room.roomNumber } });
  res.json({ success: true, room: presentRoom({ ...room, isArchived: archived }) });
}

async function addPhotos(req, res) {
  const room = toPlain(await col(C.rooms).doc(req.params.id).get());
  if (!room) throw ApiError.notFound('Room not found');
  if (!req.files?.length) throw ApiError.badRequest('Please choose at least one photo.');
  if ((room.photos || []).length + req.files.length > 12) throw ApiError.badRequest('A room can have up to 12 photos.');
  const added = [];
  for (const f of req.files) {
    const photoId = crypto.randomBytes(8).toString('hex');
    const path = `room-images/${room._id}/${photoId}-${newFileName(f.mimetype)}`;
    await saveFile(path, f.buffer, f.mimetype, { roomId: room._id });
    added.push({ id: photoId, path, contentType: f.mimetype, uploadedAt: now() });
  }
  const photos = [...(room.photos || []), ...added];
  await col(C.rooms).doc(room._id).update({ photos, updatedAt: now() });
  res.status(201).json({ success: true, room: presentRoom({ ...room, photos }) });
}

async function removePhoto(req, res) {
  const room = toPlain(await col(C.rooms).doc(req.params.id).get());
  if (!room) throw ApiError.notFound('Room not found');
  const photo = (room.photos || []).find((p) => p.id === req.params.photoId);
  if (!photo) throw ApiError.notFound('Photo not found');
  await deleteFile(photo.path);
  const photos = room.photos.filter((p) => p.id !== photo.id);
  await col(C.rooms).doc(room._id).update({ photos, updatedAt: now() });
  res.json({ success: true, room: presentRoom({ ...room, photos }) });
}

/** Room photos are not sensitive, so they can be shown in <img> tags without a sign-in header. */
async function photo(req, res) {
  const room = toPlain(await col(C.rooms).doc(req.params.id).get());
  const p = room?.photos?.find((x) => x.id === req.params.photoId);
  if (!p) throw ApiError.notFound('Photo not found');
  await streamFile(p.path, res, { contentType: p.contentType, cache: 'public, max-age=86400' });
}

module.exports = { publicList, publicOne, publicStatus, list, get, create, update, archive: (req, res) => setArchived(req, res, true), restore: (req, res) => setArchived(req, res, false), addPhotos, removePhoto, photo, presentRoom, recomputeRoom };
