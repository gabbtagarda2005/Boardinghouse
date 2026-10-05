const { db, col, C, toPlain, listOf, now } = require('../db');
const ApiError = require('../utils/ApiError');
const { round2, splitAmount, sum, formatPeso } = require('../utils/money');
const { monthRange, overlapDays, periodLabel } = require('../utils/dates');
const { audit } = require('./audit.service');
const { getSettings } = require('./settings.service');
const { SHARING, BILL_STATE } = require('../constants');

const readingId = (roomId, year, month) => `${roomId}_${year}-${String(month).padStart(2, '0')}`;

/** Tenants who stayed in the room during the month, with the number of days. */
async function eligibleOccupants(roomId, year, month) {
  const { start, end } = monthRange(year, month);
  const all = listOf(await col(C.roomAssignments).where('roomId', '==', roomId).get());
  const byTenant = new Map();
  for (const a of all) {
    if (a.startDate >= end || (a.endDate && a.endDate <= start)) continue;
    const days = overlapDays(year, month, a.startDate, a.endDate);
    if (days <= 0) continue;
    const prev = byTenant.get(a.tenantId) || { tenantId: a.tenantId, tenantName: a.tenantName, days: 0 };
    prev.days += days;
    byTenant.set(a.tenantId, prev);
  }
  return [...byTenant.values()].sort((x, y) => x.tenantName.localeCompare(y.tenantName));
}

async function lastReadingBefore(roomId, year, month) {
  const all = listOf(await col(C.electricityReadings).where('roomId', '==', roomId).get());
  return (
    all
      .filter((r) => r.mode === 'METER' && r.currentReading != null && (r.billingYear < year || (r.billingYear === year && r.billingMonth < month)))
      .sort((a, b) => b.billingYear - a.billingYear || b.billingMonth - a.billingMonth)[0] || null
  );
}

function checkMeter(previous, current, isCorrection, correctionReason, who = 'the room') {
  if (current === undefined || current === null) throw ApiError.badRequest(`Please enter the current meter reading for ${who}.`);
  const consumption = round2(current - previous);
  if (consumption < 0 && !(isCorrection && correctionReason)) {
    throw ApiError.badRequest(`The current reading for ${who} is lower than the previous one. If the meter was replaced or reset, tick "This is a correction" and give a reason.`);
  }
  return consumption;
}

/** Calculates usage, cost and each tenant's share without saving anything. */
async function computeReading(input) {
  const room = toPlain(await col(C.rooms).doc(input.roomId).get());
  if (!room) throw ApiError.notFound('Room not found');
  const settings = await getSettings();
  const year = input.billingYear;
  const month = input.billingMonth;
  const sharingMethod = input.sharingMethod || settings.defaultElectricitySharing || SHARING.EQUAL;
  const mode = sharingMethod === SHARING.INDIVIDUAL_METER ? 'METER' : input.mode || 'METER';
  const rate = input.rate ?? settings.electricityRate;
  const occupants = await eligibleOccupants(room._id, year, month);
  const r = {
    roomId: room._id,
    roomNumber: room.roomNumber,
    billingYear: year,
    billingMonth: month,
    mode,
    sharingMethod,
    rate,
    isCorrection: Boolean(input.isCorrection),
    correctionReason: input.correctionReason || null,
    previousReading: null,
    currentReading: null,
    tenantMeters: null,
    occupants,
  };

  if (sharingMethod === SHARING.INDIVIDUAL_METER) {
    // Each tenant has their own sub-meter.
    const meters = input.tenantMeters || [];
    r.tenantMeters = occupants.map((o) => {
      const m = meters.find((x) => x.tenantId === o.tenantId) || {};
      const previous = m.previousReading ?? 0;
      const consumption = checkMeter(previous, m.currentReading, r.isCorrection, r.correctionReason, o.tenantName);
      return { tenantId: o.tenantId, tenantName: o.tenantName, previousReading: previous, currentReading: m.currentReading, consumption };
    });
    r.consumption = round2(sum(r.tenantMeters.map((m) => Math.max(0, m.consumption))));
    r.shares = r.tenantMeters.map((m) => ({
      tenantId: m.tenantId,
      tenantName: m.tenantName,
      days: occupants.find((o) => o.tenantId === m.tenantId)?.days || 0,
      consumption: m.consumption,
      amount: round2(Math.max(0, m.consumption) * rate),
    }));
    r.totalCost = sum(r.shares.map((s) => s.amount));
    return r;
  }

  if (mode === 'METER') {
    let previous = input.previousReading;
    if (previous === undefined || previous === null) {
      const last = await lastReadingBefore(room._id, year, month);
      if (!last) throw ApiError.badRequest('Please enter the previous meter reading (this is the first reading for this room).');
      previous = last.currentReading;
    }
    r.previousReading = previous;
    r.currentReading = input.currentReading;
    r.consumption = checkMeter(previous, input.currentReading, r.isCorrection, r.correctionReason);
    r.totalCost = round2(Math.max(0, r.consumption) * rate);
  } else {
    if (input.totalCost === undefined || input.totalCost === null) throw ApiError.badRequest('Please enter the total electricity amount for the room.');
    r.consumption = input.consumption ?? null;
    r.totalCost = round2(input.totalCost);
  }

  if (sharingMethod === SHARING.CUSTOM) {
    const given = input.shares || [];
    const eligible = new Set(occupants.map((o) => o.tenantId));
    if (given.some((s) => !eligible.has(s.tenantId))) throw ApiError.badRequest('You can only charge tenants who stayed in this room during this month.');
    const total = sum(given.map((s) => s.amount));
    if (Math.abs(total - r.totalCost) > 0.009) {
      throw ApiError.badRequest(`The tenant amounts add up to ${formatPeso(total)}, but the total is ${formatPeso(r.totalCost)}. Please make them equal.`);
    }
    r.shares = occupants.map((o) => ({ tenantId: o.tenantId, tenantName: o.tenantName, days: o.days, amount: round2(given.find((s) => s.tenantId === o.tenantId)?.amount || 0) }));
  } else {
    const amounts = splitAmount(
      r.totalCost,
      occupants.map((o) => (sharingMethod === SHARING.PRORATED ? o.days : 1))
    );
    r.shares = occupants.map((o, i) => ({ tenantId: o.tenantId, tenantName: o.tenantName, days: o.days, amount: amounts[i] }));
  }
  if (!occupants.length && r.totalCost > 0) r.warning = 'Nobody stayed in this room during this month, so no tenant will be charged.';
  return r;
}

/** A tenant's electricity for a month, from that month's readings. */
function electricityFromReadings(readings, tenantId, roomId) {
  const mine = readings.filter((r) => r.shares?.some((s) => s.tenantId === tenantId));
  if (!mine.length) return { amount: 0, detail: { manualOverride: false } };
  const amount = sum(mine.map((r) => r.shares.find((s) => s.tenantId === tenantId).amount));
  const primary = mine.find((r) => r.roomId === roomId) || mine[0];
  const share = primary.shares.find((s) => s.tenantId === tenantId);
  return {
    amount,
    detail: {
      readingId: primary._id,
      sharingMethod: primary.sharingMethod,
      consumption: primary.consumption,
      rate: primary.rate,
      roomTotal: primary.totalCost,
      occupants: primary.shares.length,
      days: share?.days ?? null,
      tenantConsumption: share?.consumption ?? null,
      manualOverride: false,
    },
  };
}

async function readingsForMonth(year, month) {
  return listOf(await col(C.electricityReadings).where('billingYear', '==', year).where('billingMonth', '==', month).get());
}

/** Updates electricity on not-yet-sent bills that use this reading (unless set by hand). */
async function syncDraftBills(reading) {
  const { recalculate } = require('./billing.service'); // eslint-disable-line global-require
  const drafts = listOf(await col(C.bills).where('billingYear', '==', reading.billingYear).where('billingMonth', '==', reading.billingMonth).get()).filter(
    (b) =>
      b.state === BILL_STATE.DRAFT &&
      !b.electricityDetail?.manualOverride &&
      ((reading.shares || []).some((s) => s.tenantId === b.tenantId) || b.electricityDetail?.readingId === reading._id)
  );
  if (!drafts.length) return;
  const readings = await readingsForMonth(reading.billingYear, reading.billingMonth);
  const batch = db.batch();
  for (const bill of drafts) {
    const elec = electricityFromReadings(readings, bill.tenantId, bill.roomId);
    const updated = recalculate({ ...bill, electricity: elec.amount, electricityDetail: elec.detail });
    batch.update(col(C.bills).doc(bill._id), { ...updated, _id: undefined, updatedAt: now() });
  }
  await batch.commit();
}

async function saveReading(input, { actor, req, existingId } = {}) {
  let existing = null;
  if (existingId) {
    existing = toPlain(await col(C.electricityReadings).doc(existingId).get());
    if (!existing) throw ApiError.notFound('Reading not found');
    if (existing.locked) throw ApiError.conflict('This reading was already used in bills sent to tenants, so it can no longer be changed.');
  }
  const base = existing ? { roomId: existing.roomId, billingYear: existing.billingYear, billingMonth: existing.billingMonth } : {};
  const computed = await computeReading({ ...(existing || {}), ...input, ...base });
  const id = readingId(computed.roomId, computed.billingYear, computed.billingMonth);
  const { occupants, warning, ...fields } = computed;
  const doc = {
    ...fields,
    notes: input.notes ?? existing?.notes ?? null,
    readingDate: input.readingDate ? new Date(input.readingDate) : existing?.readingDate || now(),
    locked: false,
    updatedAt: now(),
  };

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(col(C.electricityReadings).doc(id));
    if (!existing && snap.exists) {
      throw ApiError.conflict(`Room ${computed.roomNumber} already has a reading for ${periodLabel(computed.billingYear, computed.billingMonth)}. Edit that reading instead.`);
    }
    tx.set(col(C.electricityReadings).doc(id), existing ? doc : { ...doc, recordedBy: actor?.uid || null, createdAt: now() }, { merge: true });
    await audit(
      {
        actor,
        req,
        action: existing ? 'electricity.update' : 'electricity.create',
        entityType: 'ElectricityReading',
        entityId: id,
        summary: `Room ${computed.roomNumber} ${periodLabel(computed.billingYear, computed.billingMonth)}: ${formatPeso(computed.totalCost)}`,
        details: { roomNumber: computed.roomNumber, period: periodLabel(computed.billingYear, computed.billingMonth), amount: computed.totalCost, kwh: computed.consumption },
        before: existing,
        after: doc,
        reason: computed.isCorrection ? computed.correctionReason : undefined,
      },
      tx
    );
  });
  const reading = { _id: id, ...doc };
  await syncDraftBills(reading);
  return { reading, warning };
}

async function deleteReading(id, { actor, req } = {}) {
  const reading = toPlain(await col(C.electricityReadings).doc(id).get());
  if (!reading) throw ApiError.notFound('Reading not found');
  if (reading.locked) throw ApiError.conflict('This reading was already used in bills sent to tenants, so it cannot be deleted.');
  await col(C.electricityReadings).doc(id).delete();
  await audit({
    actor,
    req,
    action: 'electricity.delete',
    entityType: 'ElectricityReading',
    entityId: id,
    summary: `Deleted reading for room ${reading.roomNumber}`,
    details: { roomNumber: reading.roomNumber, period: periodLabel(reading.billingYear, reading.billingMonth) },
    before: reading,
  });
  await syncDraftBills(reading);
}

module.exports = { readingId, eligibleOccupants, lastReadingBefore, computeReading, saveReading, deleteReading, syncDraftBills, electricityFromReadings, readingsForMonth };
