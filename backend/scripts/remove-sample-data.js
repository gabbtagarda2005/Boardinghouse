/**
 * Removes the sample (demo) data so the boarding house starts clean.
 *
 * Keeps: the owner account given by --keep-email, the house name, logo and other settings.
 * Removes: every other login and user, tenants, rooms, room assignments, bills, payments,
 *          electricity readings, announcements, inquiries, notifications, activity history,
 *          counters, uniqueness locks and the files that belonged to them (room photos,
 *          payment proofs, receipts, profile photos). Clears the sample contact details and
 *          payment accounts in Settings.
 *
 * Always writes a full backup (JSON) to ../backups first. Without --yes it only shows what it would do.
 *
 *   node scripts/remove-sample-data.js --keep-email you@gmail.com          (preview)
 *   node scripts/remove-sample-data.js --keep-email you@gmail.com --yes    (do it)
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { db, auth } = require('../src/config/firebase');
const { deleteFile } = require('../src/services/storage.service');

const args = process.argv.slice(2);
const doIt = args.includes('--yes');
const keepEmail = (args[args.indexOf('--keep-email') + 1] || '').toLowerCase();
const WIPE = ['activityHistory', 'announcements', 'bills', 'electricityReadings', 'inquiries', 'notifications', 'payments', 'roomAssignments', 'rooms', 'tenants', 'counters'];

/** Firestore values → JSON (dates as ISO text). */
const plain = (v) => {
  if (v && typeof v.toDate === 'function') return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
};

/** Every stored-file path inside a document (photos, proofs, receipts). */
const filePaths = (v, out = []) => {
  if (Array.isArray(v)) v.forEach((x) => filePaths(x, out));
  else if (v && typeof v === 'object' && typeof v.toDate !== 'function') {
    for (const [k, x] of Object.entries(v)) {
      if ((k === 'path' || k === 'receiptPath') && typeof x === 'string' && /\//.test(x)) out.push(x);
      else filePaths(x, out);
    }
  }
  return out;
};

(async () => {
  if (!keepEmail) throw new Error('Please pass --keep-email with the owner account to keep.');
  const keep = await auth.getUserByEmail(keepEmail);
  const keepDoc = (await db.collection('users').doc(keep.uid).get()).data();
  if (keepDoc?.role !== 'ADMIN') throw new Error(`${keepEmail} is not an owner account; stopping to be safe.`);

  // ---- Backup everything first
  const backup = { takenAt: new Date().toISOString(), project: process.env.FIREBASE_PROJECT_ID, collections: {}, logins: [] };
  for (const c of await db.listCollections()) {
    backup.collections[c.id] = (await c.get()).docs.map((d) => ({ id: d.id, ...plain(d.data()) }));
  }
  backup.logins = (await auth.listUsers(1000)).users.map((u) => ({ uid: u.uid, email: u.email || null, providers: u.providerData.map((p) => p.providerId), claims: u.customClaims || null }));
  const dir = path.join(__dirname, '..', '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `before-sample-cleanup-${backup.takenAt.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(backup, null, 1));
  console.log('Backup saved:', file);

  // ---- What would be removed
  const logins = backup.logins.filter((u) => u.uid !== keep.uid);
  const users = backup.collections.users.filter((u) => u.id !== keep.uid);
  const uniques = (backup.collections.uniques || []).filter((u) => u.owner !== keep.uid);
  const files = new Set();
  for (const c of [...WIPE, 'users']) for (const d of backup.collections[c] || []) if (c !== 'users' || d.id !== keep.uid) filePaths(d).forEach((p) => files.add(p));
  console.log(`\nKeeping owner: ${keepEmail}`);
  console.log(`Logins to delete: ${logins.length} → ${logins.map((u) => u.email || u.uid).join(', ')}`);
  console.log(`User records to delete: ${users.length}`);
  for (const c of WIPE) console.log(`${c.padEnd(20)} ${(backup.collections[c] || []).length}`);
  console.log(`${'uniques'.padEnd(20)} ${uniques.length}`);
  console.log(`Stored files to delete: ${files.size}`);
  console.log('Settings: clear address, contact phone, contact email and payment accounts (house name, logo and the rest are kept)');
  if (!doIt) {
    console.log('\nPreview only. Run again with --yes to delete.');
    return;
  }

  // ---- Delete
  for (const p of files) await deleteFile(p).catch((e) => console.warn('  file not removed:', p, e.message));
  for (const c of WIPE) await db.recursiveDelete(db.collection(c));
  for (const u of uniques) await db.collection('uniques').doc(u.id).delete();
  for (const u of users) await db.recursiveDelete(db.collection('users').doc(u.id));
  for (const u of logins) await auth.deleteUser(u.uid).catch((e) => console.warn('  login not removed:', u.email, e.message));
  await db.collection('settings').doc('global').set({ address: '', contactPhone: '', contactEmail: '', paymentChannels: [], updatedAt: new Date() }, { merge: true });
  console.log('\nDone. Sample data removed.');
})().catch((e) => {
  console.error('Stopped:', e.message);
  process.exitCode = 1;
});
