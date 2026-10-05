/**
 * Small helpers around Cloud Firestore used by every service:
 * collection names, document conversion, counters, and uniqueness locks.
 */
const crypto = require('crypto');
const { db, Timestamp } = require('../config/firebase');
const ApiError = require('../utils/ApiError');

const C = {
  users: 'users',
  tenants: 'tenants',
  rooms: 'rooms',
  roomAssignments: 'roomAssignments',
  bills: 'bills',
  electricityReadings: 'electricityReadings',
  payments: 'payments',
  notifications: 'notifications',
  announcements: 'announcements',
  activityHistory: 'activityHistory',
  settings: 'settings',
  counters: 'counters',
  uniques: 'uniques',
  inquiries: 'inquiries',
};

const col = (name) => db.collection(name);

/** Converts Firestore values (Timestamps) to plain JS (Dates), recursively. */
function fromFirestore(value) {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(fromFirestore);
  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fromFirestore(v)]));
  }
  return value;
}

/** Document snapshot → plain object with `_id` (the document id), or null. */
function toPlain(snap) {
  if (!snap || !snap.exists) return null;
  return { _id: snap.id, ...fromFirestore(snap.data()) };
}

const listOf = (querySnap) => querySnap.docs.map(toPlain);

const now = () => new Date();

/** Atomically increments a named counter inside a transaction and returns the new value. */
async function nextCounter(tx, name) {
  const ref = col(C.counters).doc(name);
  const snap = await tx.get(ref);
  const seq = (snap.exists ? snap.data().seq : 0) + 1;
  return { seq, write: () => tx.set(ref, { seq, updatedAt: now() }) };
}

/** Same as nextCounter but outside a transaction. */
async function incrementCounter(name) {
  return db.runTransaction(async (tx) => {
    const c = await nextCounter(tx, name);
    c.write();
    return c.seq;
  });
}

/**
 * Uniqueness locks (Firestore has no unique indexes). A lock is a document in `uniques`
 * whose id is derived from the key. Reads must happen before writes in a transaction,
 * so use: const lock = await readUnique(tx, key); ... claimUnique(tx, lock, ownerId).
 */
function uniqueRef(key) {
  return col(C.uniques).doc(crypto.createHash('sha256').update(key).digest('hex').slice(0, 40));
}

async function readUnique(tx, key) {
  const ref = uniqueRef(key);
  const snap = await tx.get(ref);
  return { key, ref, exists: snap.exists, owner: snap.exists ? snap.data().owner : null };
}

function claimUnique(tx, lock, owner, message = 'This record already exists') {
  if (lock.exists && lock.owner !== owner) throw ApiError.conflict(message);
  tx.set(lock.ref, { key: lock.key, owner, createdAt: now() });
}

function releaseUnique(tx, key) {
  tx.delete(uniqueRef(key));
}

/** Splits an array into chunks (Firestore `in` queries accept at most 30 values). */
function chunk(arr, size = 30) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Loads several documents by id from one collection. Returns a Map id → plain object. */
async function getMany(collection, ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  const map = new Map();
  for (const part of chunk(unique, 100)) {
    const snaps = await db.getAll(...part.map((id) => col(collection).doc(id)));
    snaps.forEach((s) => s.exists && map.set(s.id, toPlain(s)));
  }
  return map;
}

module.exports = { db, C, col, toPlain, listOf, fromFirestore, now, nextCounter, incrementCounter, readUnique, claimUnique, releaseUnique, uniqueRef, chunk, getMany, Timestamp };
