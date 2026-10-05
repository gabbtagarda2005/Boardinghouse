/**
 * Development sample data.   npm run seed   (add -- --reset to start over; emulator only)
 * Uses the same services as the app, so balances, occupancy and history are consistent.
 */
const env = require('../config/env');
const { auth, usingEmulators } = require('../config/firebase');
const { db, col, C, listOf } = require('../db');
const accounts = require('../services/accounts.service');
const { updateSettings } = require('../services/settings.service');
const { statusFor, assignTenant } = require('../services/occupancy.service');
const electricity = require('../services/electricity.service');
const billing = require('../services/billing.service');
const payments = require('../services/payment.service');
const { notifyUsers } = require('../services/notification.service');

// Sample data is for the local emulators only: never fill the live database with demo tenants.
if (!usingEmulators) {
  console.error('Refusing to add sample data: this is the live database. Use the local emulators (USE_FIREBASE_EMULATORS=true).');
  process.exit(1);
}
const { manilaNow } = require('../services/dashboard.service');
const { incrementCounter, now, uniqueRef } = require('../db');
const { ROLE, TENANT_STATUS } = require('../constants');

const TENANT_PASSWORD = 'Tenant@123';

const ROOMS = [
  { roomNumber: '101', name: 'Sampaguita', building: 'Main', capacity: 4, monthlyRent: 2500, amenities: ['Wi-Fi', 'Bed', 'Cabinet', 'Electric fan', 'Shared CR'], description: 'Spacious room near the common kitchen.' },
  { roomNumber: '102', name: 'Ilang-Ilang', building: 'Main', capacity: 2, monthlyRent: 3500, amenities: ['Wi-Fi', 'Bed', 'Air conditioning', 'Private CR'], description: 'Air-conditioned double room with its own comfort room.' },
  { roomNumber: '201', name: 'Narra', building: 'Main', capacity: 4, monthlyRent: 2800, amenities: ['Wi-Fi', 'Bed', 'Electric fan', 'Study table'], description: 'Bright room with a balcony.' },
  { roomNumber: '202', name: 'Molave', building: 'Main', capacity: 3, monthlyRent: 3000, amenities: ['Wi-Fi', 'Bed', 'Air conditioning'], description: 'Quiet room at the back of the building.' },
  { roomNumber: '301', name: 'Acacia', building: 'Annex', capacity: 1, monthlyRent: 5000, amenities: ['Wi-Fi', 'Bed', 'Air conditioning', 'Private CR'], description: 'Solo room in the annex.' },
  { roomNumber: '302', name: 'Mahogany', building: 'Annex', capacity: 2, monthlyRent: 3800, amenities: ['Wi-Fi', 'Bed'], description: 'Being repainted.', underMaintenance: true },
];

const TENANTS = [
  { name: 'Juan Dela Cruz', email: 'juan@example.com', phone: '0917 123 4567', occupation: 'Engineering student', room: '101' },
  { name: 'Maria Santos', email: 'maria@example.com', phone: '0918 222 3344', occupation: 'Nursing student', room: '101' },
  { name: 'Jose Ramos', email: 'jose@example.com', phone: '0919 555 1212', occupation: 'Call center agent', room: '101' },
  { name: 'Ana Reyes', email: 'ana@example.com', phone: '0920 777 8899', occupation: 'Accountancy student', room: '102' },
  { name: 'Carlo Mendoza', email: 'carlo@example.com', phone: '0921 101 2020', occupation: 'IT intern', room: '102' },
  { name: 'Liza Gomez', email: 'liza@example.com', phone: '0922 303 4040', occupation: 'Pharmacy assistant', room: '201' },
  { name: 'Mark Villanueva', email: 'mark@example.com', phone: '0923 505 6060', occupation: 'Architecture student', room: '201' },
  { name: 'Grace Tan', email: 'grace@example.com', phone: '0925 707 8080', occupation: 'Bank teller', room: '301' },
  { name: 'Paolo Cruz', email: 'paolo@example.com', phone: '0926 909 1010', occupation: 'Seafarer', room: '202' },
];

const shift = (y, m, d) => {
  const x = new Date(Date.UTC(y, m - 1 + d, 1));
  return { year: x.getUTCFullYear(), month: x.getUTCMonth() + 1 };
};

async function wipe() {
  if (!usingEmulators) throw new Error('Reset is only allowed on the local emulators. It would delete real data.');
  for (const name of Object.values(C)) {
    const snap = await col(name).get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch();
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  const users = await auth.listUsers(1000);
  if (users.users.length) await auth.deleteUsers(users.users.map((u) => u.uid));
  console.log('[seed] emulator data cleared');
}

async function seed({ reset = false } = {}) {
  if (reset) await wipe();
  if (!(await col(C.users).where('role', '==', ROLE.ADMIN).limit(1).get()).empty) {
    console.log('[seed] data already present, nothing to do (use --reset on the emulators to start over)');
    return false;
  }
  const adminUid = await accounts.createAccount({ email: env.seedAdminEmail, password: env.seedAdminPassword, name: 'Boarding House Owner', phone: '0917 000 0000', role: ROLE.ADMIN, mustChangePassword: false });
  const ctx = { actor: { uid: adminUid, name: 'Boarding House Owner' } };

  await updateSettings({
    houseName: 'Casa Dela Rosa Boarding House',
    address: '123 Rizal Street, Barangay San Roque, Quezon City',
    contactPhone: '0917 000 0000',
    contactEmail: 'owner@casadelarosa.example',
    defaultDueDay: 10,
    electricityRate: 15,
    defaultElectricitySharing: 'EQUAL',
    waterEnabled: true,
    waterChargePerTenant: 150,
    defaultOtherCharges: [],
    paymentInstructions: 'Pay in cash at the office (Mon-Sat, 8AM-6PM) or send to one of the accounts below. Then send your reference number and a screenshot in the app. Your bill is marked paid once the owner confirms it.',
    paymentChannels: [
      { paymentMethod: 'GCASH', provider: 'GCash', accountName: 'Rosa D.', accountNumber: '0917 000 0000' },
      { paymentMethod: 'MAYA', provider: 'Maya', accountName: 'Rosa D.', accountNumber: '0917 000 0000' },
      { paymentMethod: 'BANK_TRANSFER', provider: 'BDO', accountName: 'Rosa Dela Rosa', accountNumber: '0012-3456-7890' },
      { paymentMethod: 'CASH', provider: 'Office', instructions: 'Ground floor office, Mon-Sat 8AM-6PM' },
    ],
  });

  const rooms = {};
  for (const r of ROOMS) {
    const ref = col(C.rooms).doc();
    const doc = { ...r, underMaintenance: Boolean(r.underMaintenance), occupiedBeds: 0, photos: [], isArchived: false, createdAt: now(), updatedAt: now() };
    doc.status = statusFor(doc);
    await ref.set(doc);
    await uniqueRef(`room:${r.roomNumber.toLowerCase()}`).set({ key: `room:${r.roomNumber.toLowerCase()}`, owner: ref.id });
    rooms[r.roomNumber] = ref.id;
  }

  const cur = manilaNow();
  const start = shift(cur.year, cur.month, -3);
  const tenants = [];
  for (const [i, t] of TENANTS.entries()) {
    const uid = await accounts.createAccount({ email: t.email, password: TENANT_PASSWORD, name: t.name, phone: t.phone, role: ROLE.TENANT, mustChangePassword: false });
    const seq = await incrementCounter('tenant-code');
    const moveIn = new Date(Date.UTC(start.year, start.month - 1, i === TENANTS.length - 2 ? 16 : 1));
    await col(C.tenants).doc(uid).set({
      uid,
      tenantCode: `T-${String(seq).padStart(4, '0')}`,
      name: t.name,
      email: t.email,
      phone: t.phone,
      occupation: t.occupation,
      address: 'Province address on file',
      emergencyContact: { name: `Parent of ${t.name.split(' ')[0]}`, phone: '0930 000 0000', relationship: 'Parent' },
      status: TENANT_STATUS.ACTIVE,
      moveInDate: moveIn,
      createdAt: now(),
      updatedAt: now(),
    });
    await assignTenant({ tenantId: uid, roomId: rooms[t.room], startDate: moveIn }, ctx);
    tenants.push({ ...t, uid });
  }

  const meter = { 101: 12500, 102: 1830, 201: 3010, 202: 950, 301: 2100 };
  const usage = { 101: [300, 280, 310, 290], 102: [140, 150, 160, 155], 201: [120, 110, 130, 125], 202: [90, 95, 100, 98], 301: [80, 85, 90, 88] };
  for (let k = 0; k < 4; k += 1) {
    const p = shift(start.year, start.month, k);
    for (const no of Object.keys(meter)) {
      await electricity.saveReading({ roomId: rooms[no], billingYear: p.year, billingMonth: p.month, previousReading: meter[no], currentReading: meter[no] + usage[no][k], rate: 15, sharingMethod: 'EQUAL' }, ctx);
      meter[no] += usage[no][k];
    }
    await billing.generateBills({ billingYear: p.year, billingMonth: p.month }, ctx);
    await billing.publishBills({ billingYear: p.year, billingMonth: p.month }, ctx);
  }

  const bills = listOf(await col(C.bills).get()).sort((a, b) => a.billingYear - b.billingYear || a.billingMonth - b.billingMonth);
  for (const bill of bills) {
    const t = tenants.find((x) => x.uid === bill.tenantId);
    const idx = (bill.billingYear - start.year) * 12 + (bill.billingMonth - start.month);
    const paidOn = new Date(Math.min(Date.now() - 3600000, bill.dueDate.getTime() - 2 * 86400000));
    if (t.email === 'jose@example.com' && idx >= 1) continue; // overdue account
    if (t.email === 'mark@example.com' && idx === 2) {
      await payments.recordPayment({ tenantId: t.uid, billId: bill._id, amount: Math.round(bill.remainingBalance / 2), paymentMethod: 'CASH', paymentDate: paidOn }, ctx);
      continue; // partially paid
    }
    if (idx === 3 && ['maria@example.com', 'ana@example.com'].includes(t.email)) {
      const tenantDoc = { _id: t.uid, name: t.name };
      await payments.submitClaim(tenantDoc, { billId: bill._id, amount: bill.remainingBalance, paymentMethod: 'GCASH', referenceNumber: `GC-${Date.now()}${Math.floor(Math.random() * 1000)}`, paymentDate: new Date() }, null);
      continue; // waiting for verification
    }
    if (idx === 3 && t.email !== 'juan@example.com') continue; // current month, not yet due
    const method = idx % 2 ? 'CASH' : 'GCASH';
    await payments.recordPayment(
      { tenantId: t.uid, billId: bill._id, amount: bill.remainingBalance, paymentMethod: method, referenceNumber: method === 'GCASH' ? `GC-${bill.billNumber}` : undefined, paymentDate: paidOn },
      ctx
    );
  }
  await billing.refreshOverdue();

  const annRef = col(C.announcements).doc();
  await annRef.set({
    title: 'Water interruption this Saturday',
    body: 'There will be scheduled water maintenance this Saturday from 9AM to 3PM. Please store water the night before. Thank you!',
    audience: 'ALL',
    roomIds: [],
    recipientIds: [],
    audienceText: 'all tenants',
    pinned: true,
    recipientCount: tenants.length,
    createdBy: adminUid,
    createdByName: 'Boarding House Owner',
    createdAt: now(),
  });
  await notifyUsers(
    tenants.map((t) => t.uid),
    { type: 'announcement', title: 'Water interruption this Saturday', message: 'There will be scheduled water maintenance this Saturday from 9AM to 3PM.', data: { announcementId: annRef.id } }
  );

  console.log('\n[seed] Done.');
  console.log(`  Owner   : ${env.seedAdminEmail} / ${env.seedAdminPassword}`);
  console.log(`  Tenants : maria@example.com, juan@example.com, jose@example.com ... / ${TENANT_PASSWORD}\n`);
  return true;
}

module.exports = { seed };

if (require.main === module) {
  seed({ reset: process.argv.includes('--reset') })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed] failed:', err.message);
      process.exit(1);
    });
}
