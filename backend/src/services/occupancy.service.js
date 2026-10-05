const { db, col, C, toPlain, listOf, now, readUnique, claimUnique, releaseUnique } = require('../db');
const ApiError = require('../utils/ApiError');
const { audit } = require('./audit.service');
const { notifyUsers } = require('./notification.service');
const { ROOM_STATUS, ASSIGNMENT_STATUS, TENANT_STATUS, USER_STATUS } = require('../constants');

function statusFor({ underMaintenance, occupiedBeds, capacity }) {
  if (underMaintenance) return ROOM_STATUS.MAINTENANCE;
  if (!occupiedBeds) return ROOM_STATUS.AVAILABLE;
  if (occupiedBeds >= capacity) return ROOM_STATUS.FULL;
  return ROOM_STATUS.PARTIALLY_OCCUPIED;
}

const bedKey = (roomId, bed) => `activeBed:${roomId}:${bed}`;
const tenantKey = (tenantId) => `activeTenant:${tenantId}`;

async function activeAssignmentsIn(tx, roomId) {
  return listOf(await tx.get(col(C.roomAssignments).where('roomId', '==', roomId).where('status', '==', ASSIGNMENT_STATUS.ACTIVE)));
}

/** Picks and validates a bed. Throws when the room cannot take another tenant. */
function pickBed(room, active, requestedBed, ignoreAssignmentId) {
  if (room.isArchived) throw ApiError.badRequest('This room is archived. Restore it before assigning tenants.');
  if (room.underMaintenance) throw ApiError.badRequest(`Room ${room.roomNumber} is under repair. End the maintenance first.`);
  const occupied = active.filter((a) => a._id !== ignoreAssignmentId);
  if (occupied.length >= room.capacity) throw ApiError.conflict(`Room ${room.roomNumber} is full (${room.capacity} of ${room.capacity} beds taken).`);
  const taken = new Set(occupied.map((a) => a.bedNumber));
  if (requestedBed) {
    if (requestedBed < 1 || requestedBed > room.capacity) throw ApiError.badRequest(`Please choose a bed from 1 to ${room.capacity}.`);
    if (taken.has(requestedBed)) throw ApiError.conflict(`Bed ${requestedBed} in Room ${room.roomNumber} is already taken.`);
    return requestedBed;
  }
  for (let b = 1; b <= room.capacity; b += 1) if (!taken.has(b)) return b;
  throw ApiError.conflict('No free bed in this room.');
}

const dateOrNow = (d) => (d ? new Date(d) : now());

async function assignTenant({ tenantId, roomId, bedNumber, startDate, monthlyRent, notes }, { actor, req } = {}) {
  const result = await db.runTransaction(async (tx) => {
    // ---- reads ----
    const tenant = toPlain(await tx.get(col(C.tenants).doc(tenantId)));
    if (!tenant) throw ApiError.notFound('Tenant not found');
    const user = toPlain(await tx.get(col(C.users).doc(tenantId)));
    if (!user || user.status !== USER_STATUS.ACTIVE || tenant.status === TENANT_STATUS.INACTIVE) throw ApiError.badRequest('This tenant account is deactivated.');
    const tLock = await readUnique(tx, tenantKey(tenantId));
    if (tLock.exists) throw ApiError.conflict(`${tenant.name} already has a room. Use "Transfer" to move them.`);
    const room = toPlain(await tx.get(col(C.rooms).doc(roomId)));
    if (!room) throw ApiError.notFound('Room not found');
    const active = await activeAssignmentsIn(tx, roomId);
    const bed = pickBed(room, active, bedNumber);
    const bLock = await readUnique(tx, bedKey(roomId, bed));

    // ---- writes ----
    const ref = col(C.roomAssignments).doc();
    const start = dateOrNow(startDate);
    const rent = monthlyRent ?? room.monthlyRent;
    claimUnique(tx, bLock, ref.id, `Bed ${bed} was just taken. Please choose another bed.`);
    claimUnique(tx, tLock, ref.id);
    const assignment = {
      tenantId,
      tenantName: tenant.name,
      roomId,
      roomNumber: room.roomNumber,
      bedNumber: bed,
      startDate: start,
      endDate: null,
      monthlyRent: rent,
      status: ASSIGNMENT_STATUS.ACTIVE,
      notes: notes || null,
      assignedBy: actor?.uid || null,
      createdAt: now(),
      updatedAt: now(),
    };
    tx.set(ref, assignment);
    tx.update(col(C.tenants).doc(tenantId), {
      status: TENANT_STATUS.ACTIVE,
      currentAssignmentId: ref.id,
      currentRoomId: roomId,
      currentRoomNumber: room.roomNumber,
      currentBedNumber: bed,
      monthlyRent: rent,
      moveInDate: tenant.moveInDate || start,
      moveOutDate: null,
      updatedAt: now(),
    });
    const occupiedBeds = active.length + 1;
    tx.update(col(C.rooms).doc(roomId), { occupiedBeds, status: statusFor({ ...room, occupiedBeds }), updatedAt: now() });
    await audit(
      {
        actor,
        req,
        action: 'assignment.create',
        entityType: 'RoomAssignment',
        entityId: ref.id,
        summary: `Assigned ${tenant.name} to room ${room.roomNumber}, bed ${bed}`,
        details: { personName: tenant.name, roomNumber: room.roomNumber, bedNumber: bed, tenantId },
        after: assignment,
      },
      tx
    );
    return { _id: ref.id, ...assignment };
  });

  notifyUsers([tenantId], {
    type: 'room_assignment',
    title: 'Your room is ready',
    message: `You have been assigned to Room ${result.roomNumber}, Bed ${result.bedNumber}.`,
    data: { roomId: result.roomId },
  });
  return result;
}

async function transferTenant({ tenantId, roomId, bedNumber, date, monthlyRent, reason }, { actor, req } = {}) {
  const result = await db.runTransaction(async (tx) => {
    const tenant = toPlain(await tx.get(col(C.tenants).doc(tenantId)));
    if (!tenant) throw ApiError.notFound('Tenant not found');
    if (!tenant.currentAssignmentId) throw ApiError.badRequest(`${tenant.name} has no room yet. Use "Assign Room" instead.`);
    const current = toPlain(await tx.get(col(C.roomAssignments).doc(tenant.currentAssignmentId)));
    if (!current || current.status !== ASSIGNMENT_STATUS.ACTIVE) throw ApiError.badRequest('This tenant has no current room.');
    const room = toPlain(await tx.get(col(C.rooms).doc(roomId)));
    if (!room) throw ApiError.notFound('Room not found');
    const sameRoom = roomId === current.roomId;
    if (sameRoom && (!bedNumber || bedNumber === current.bedNumber)) throw ApiError.badRequest(`${tenant.name} is already in that room and bed.`);
    const oldRoom = sameRoom ? room : toPlain(await tx.get(col(C.rooms).doc(current.roomId)));
    const activeNew = await activeAssignmentsIn(tx, roomId);
    const activeOld = sameRoom ? activeNew : await activeAssignmentsIn(tx, current.roomId);
    const bed = pickBed(room, activeNew, bedNumber, sameRoom ? current._id : undefined);
    const bLock = await readUnique(tx, bedKey(roomId, bed));
    const tLock = await readUnique(tx, tenantKey(tenantId));
    const when = dateOrNow(date);
    if (when < current.startDate) throw ApiError.badRequest('The move date cannot be before the tenant moved into their current room.');

    const ref = col(C.roomAssignments).doc();
    const rent = monthlyRent ?? room.monthlyRent;
    tx.update(col(C.roomAssignments).doc(current._id), { status: ASSIGNMENT_STATUS.ENDED, endDate: when, endReason: 'TRANSFER', endedBy: actor?.uid || null, updatedAt: now() });
    releaseUnique(tx, bedKey(current.roomId, current.bedNumber));
    claimUnique(tx, bLock, ref.id, `Bed ${bed} was just taken. Please choose another bed.`);
    claimUnique(tx, { ...tLock, exists: false }, ref.id);
    const assignment = {
      tenantId,
      tenantName: tenant.name,
      roomId,
      roomNumber: room.roomNumber,
      bedNumber: bed,
      startDate: when,
      endDate: null,
      monthlyRent: rent,
      status: ASSIGNMENT_STATUS.ACTIVE,
      notes: reason || null,
      assignedBy: actor?.uid || null,
      createdAt: now(),
      updatedAt: now(),
    };
    tx.set(ref, assignment);
    tx.update(col(C.tenants).doc(tenantId), {
      currentAssignmentId: ref.id,
      currentRoomId: roomId,
      currentRoomNumber: room.roomNumber,
      currentBedNumber: bed,
      monthlyRent: rent,
      updatedAt: now(),
    });
    if (sameRoom) {
      tx.update(col(C.rooms).doc(roomId), { updatedAt: now() });
    } else {
      const newCount = activeNew.length + 1;
      const oldCount = Math.max(0, activeOld.length - 1);
      tx.update(col(C.rooms).doc(roomId), { occupiedBeds: newCount, status: statusFor({ ...room, occupiedBeds: newCount }), updatedAt: now() });
      tx.update(col(C.rooms).doc(oldRoom._id), { occupiedBeds: oldCount, status: statusFor({ ...oldRoom, occupiedBeds: oldCount }), updatedAt: now() });
    }
    await audit(
      {
        actor,
        req,
        action: 'assignment.transfer',
        entityType: 'RoomAssignment',
        entityId: ref.id,
        summary: `Transferred ${tenant.name} to room ${room.roomNumber}, bed ${bed}`,
        details: { personName: tenant.name, fromRoom: oldRoom.roomNumber, toRoom: room.roomNumber, bedNumber: bed, tenantId },
        before: current,
        after: assignment,
        reason,
      },
      tx
    );
    return { _id: ref.id, ...assignment };
  });

  notifyUsers([tenantId], {
    type: 'room_assignment',
    title: 'Room transfer',
    message: `You have been moved to Room ${result.roomNumber}, Bed ${result.bedNumber}.`,
    data: { roomId: result.roomId },
  });
  return result;
}

/** Ends the tenant's stay (move-out) or deactivates them. History is kept. */
async function endTenancy({ tenantId, date, reason, deactivate = false }, { actor, req } = {}) {
  return db.runTransaction(async (tx) => {
    const tenant = toPlain(await tx.get(col(C.tenants).doc(tenantId)));
    if (!tenant) throw ApiError.notFound('Tenant not found');
    const current = tenant.currentAssignmentId ? toPlain(await tx.get(col(C.roomAssignments).doc(tenant.currentAssignmentId))) : null;
    const room = current ? toPlain(await tx.get(col(C.rooms).doc(current.roomId))) : null;
    const active = current ? await activeAssignmentsIn(tx, current.roomId) : [];
    const when = dateOrNow(date);
    if (current && when < current.startDate) throw ApiError.badRequest('The move-out date cannot be before the move-in date.');

    if (current && current.status === ASSIGNMENT_STATUS.ACTIVE) {
      tx.update(col(C.roomAssignments).doc(current._id), {
        status: ASSIGNMENT_STATUS.ENDED,
        endDate: when,
        endReason: deactivate ? 'DEACTIVATED' : 'MOVE_OUT',
        endedBy: actor?.uid || null,
        updatedAt: now(),
      });
      releaseUnique(tx, bedKey(current.roomId, current.bedNumber));
      releaseUnique(tx, tenantKey(tenantId));
      const occupiedBeds = Math.max(0, active.length - 1);
      tx.update(col(C.rooms).doc(room._id), { occupiedBeds, status: statusFor({ ...room, occupiedBeds }), updatedAt: now() });
    }
    const update = {
      status: deactivate ? TENANT_STATUS.INACTIVE : TENANT_STATUS.MOVED_OUT,
      currentAssignmentId: null,
      currentRoomId: null,
      currentRoomNumber: null,
      currentBedNumber: null,
      moveOutDate: current ? when : tenant.moveOutDate || when,
      updatedAt: now(),
    };
    tx.update(col(C.tenants).doc(tenantId), update);
    await audit(
      {
        actor,
        req,
        action: deactivate ? 'tenant.deactivate' : 'tenant.move_out',
        entityType: 'Tenant',
        entityId: tenantId,
        summary: deactivate ? `Deactivated ${tenant.name}` : `${tenant.name} moved out`,
        details: { personName: tenant.name, roomNumber: room?.roomNumber, tenantId },
        before: tenant,
        after: update,
        reason,
      },
      tx
    );
    return { ...tenant, ...update };
  });
}

/** Recounts a room's occupants (used after room edits). */
async function recomputeRoom(roomId) {
  return db.runTransaction(async (tx) => {
    const room = toPlain(await tx.get(col(C.rooms).doc(roomId)));
    if (!room) return null;
    const active = await activeAssignmentsIn(tx, roomId);
    const update = { occupiedBeds: active.length, status: statusFor({ ...room, occupiedBeds: active.length }) };
    tx.update(col(C.rooms).doc(roomId), update);
    return { ...room, ...update };
  });
}

module.exports = { statusFor, assignTenant, transferTenant, endTenancy, recomputeRoom, bedKey, tenantKey };
