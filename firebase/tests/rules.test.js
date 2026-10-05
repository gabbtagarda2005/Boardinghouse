// Security rules tests. Run with: npm run test:rules (starts the Firestore + Storage emulators)
const { describe, test, before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, addDoc, collection } = require('firebase/firestore');
const { ref, uploadBytes, getBytes } = require('firebase/storage');

let env;
const ROOT = path.join(__dirname, '..');

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-boardinghouse',
    firestore: { rules: fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: fs.readFileSync(path.join(ROOT, 'storage.rules'), 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tenants/maria'), { name: 'Maria', currentRoomId: 'room101' });
    await setDoc(doc(db, 'tenants/juan'), { name: 'Juan', currentRoomId: 'room102' });
    await setDoc(doc(db, 'users/maria'), { role: 'TENANT', name: 'Maria', phone: '1' });
    await setDoc(doc(db, 'rooms/room101'), { roomNumber: '101', capacity: 4 });
    await setDoc(doc(db, 'rooms/room102'), { roomNumber: '102', capacity: 2 });
    await setDoc(doc(db, 'bills/b1'), { tenantId: 'maria', state: 'PUBLISHED', totalAmount: 3100 });
    await setDoc(doc(db, 'bills/b2'), { tenantId: 'juan', state: 'PUBLISHED', totalAmount: 2500 });
    await setDoc(doc(db, 'bills/draft'), { tenantId: 'maria', state: 'DRAFT', totalAmount: 1 });
    await setDoc(doc(db, 'payments/p1'), { tenantId: 'juan', status: 'PENDING_VERIFICATION', amount: 100 });
    await setDoc(doc(db, 'notifications/n1'), { userId: 'maria', title: 'Hi', readAt: null });
    await setDoc(doc(db, 'announcements/a1'), { audience: 'ALL', recipientIds: [] });
    await setDoc(doc(db, 'announcements/a2'), { audience: 'TENANTS', recipientIds: ['juan'] });
    await setDoc(doc(db, 'activityHistory/x'), { title: 'Payment Confirmed' });
    await setDoc(doc(db, 'counters/receipt'), { seq: 1 });
  });
});

const maria = () => env.authenticatedContext('maria', { role: 'TENANT' }).firestore();
const admin = () => env.authenticatedContext('owner', { role: 'ADMIN' }).firestore();

describe('tenants can only see their own records', () => {
  test('own bill yes, other tenant bill no, drafts no', async () => {
    await assertSucceeds(getDoc(doc(maria(), 'bills/b1')));
    await assertFails(getDoc(doc(maria(), 'bills/b2')));
    await assertFails(getDoc(doc(maria(), 'bills/draft')));
  });
  test('cannot change bill amounts', async () => {
    await assertFails(updateDoc(doc(maria(), 'bills/b1'), { totalAmount: 0 }));
  });
  test('assigned room only; cannot change capacity', async () => {
    await assertSucceeds(getDoc(doc(maria(), 'rooms/room101')));
    await assertFails(getDoc(doc(maria(), 'rooms/room102')));
    await assertFails(updateDoc(doc(maria(), 'rooms/room101'), { capacity: 99 }));
  });
  test("cannot read another tenant's payment or confirm payments", async () => {
    await assertFails(getDoc(doc(maria(), 'payments/p1')));
    await assertFails(updateDoc(doc(admin().app ? maria() : maria(), 'payments/p1'), { status: 'CONFIRMED' }));
  });
  test('can submit own pending payment claim only', async () => {
    const base = { tenantId: 'maria', status: 'PENDING_VERIFICATION', amount: 500, paymentMethod: 'GCASH' };
    await assertSucceeds(addDoc(collection(maria(), 'payments'), base));
    await assertFails(addDoc(collection(maria(), 'payments'), { ...base, status: 'CONFIRMED' }));
    await assertFails(addDoc(collection(maria(), 'payments'), { ...base, tenantId: 'juan' }));
    await assertFails(addDoc(collection(maria(), 'payments'), { ...base, verifiedBy: 'maria' }));
  });
  test('notifications: own only, may only mark as read', async () => {
    await assertSucceeds(getDoc(doc(maria(), 'notifications/n1')));
    await assertSucceeds(updateDoc(doc(maria(), 'notifications/n1'), { readAt: new Date() }));
    await assertFails(updateDoc(doc(maria(), 'notifications/n1'), { title: 'changed' }));
  });
  test('announcements: all + addressed to them', async () => {
    await assertSucceeds(getDoc(doc(maria(), 'announcements/a1')));
    await assertFails(getDoc(doc(maria(), 'announcements/a2')));
  });
  test('no activity history, no internal collections, no role escalation', async () => {
    await assertFails(getDoc(doc(maria(), 'activityHistory/x')));
    await assertFails(getDoc(doc(maria(), 'counters/receipt')));
    await assertFails(updateDoc(doc(maria(), 'users/maria'), { role: 'ADMIN' }));
    await assertSucceeds(updateDoc(doc(maria(), 'users/maria'), { phone: '0917' }));
  });
  test('signed-out users see nothing', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'rooms/room101')));
    await assertFails(getDoc(doc(anon, 'settings/global')));
  });
});

describe('admin', () => {
  test('can manage records and read activity history', async () => {
    await assertSucceeds(getDoc(doc(admin(), 'bills/b2')));
    await assertSucceeds(updateDoc(doc(admin(), 'payments/p1'), { status: 'CONFIRMED' }));
    await assertSucceeds(getDoc(doc(admin(), 'activityHistory/x')));
    await assertFails(setDoc(doc(admin(), 'activityHistory/y'), { title: 'forged' }));
  });
});

describe('storage', () => {
  test('payment proofs are private to the tenant and the owner', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const mariaStorage = env.authenticatedContext('maria', { role: 'TENANT' }).storage();
    await assertSucceeds(uploadBytes(ref(mariaStorage, 'payment-proofs/maria/proof.png'), png, { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(mariaStorage, 'payment-proofs/juan/proof.png'), png, { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(mariaStorage, 'payment-proofs/maria/virus.exe'), png, { contentType: 'application/x-msdownload' }));
    const juanStorage = env.authenticatedContext('juan', { role: 'TENANT' }).storage();
    await assertFails(getBytes(ref(juanStorage, 'payment-proofs/maria/proof.png')));
    const ownerStorage = env.authenticatedContext('owner', { role: 'ADMIN' }).storage();
    await assertSucceeds(getBytes(ref(ownerStorage, 'payment-proofs/maria/proof.png')));
  });
  test('tenants cannot upload room images or receipts', async () => {
    const s = env.authenticatedContext('maria', { role: 'TENANT' }).storage();
    const png = new Uint8Array([1, 2, 3]);
    await assertFails(uploadBytes(ref(s, 'room-images/room101/a.png'), png, { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(s, 'receipts/maria/r.pdf'), png, { contentType: 'application/pdf' }));
  });
});
