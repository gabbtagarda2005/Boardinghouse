const { describe, test, before, beforeEach } = require('node:test');
const { expect } = require('expect');
const { request, clearAll, makeApp, signIn, createAdmin } = require('./helpers');

let app;
let admin;
const api = (method, url, token) => request(app)[method](`/api/v1${url}`).set('Authorization', `Bearer ${token}`);
const PNG = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D4944415478DA63F8FFFF3F0005FE02FEA7D6A4E20000000049454E44AE426082', 'hex');

before(() => {
  app = makeApp();
});
beforeEach(async () => {
  await clearAll();
  admin = await createAdmin();
});

const createRoom = async (body = {}) => {
  const res = await api('post', '/rooms', admin).send({ roomNumber: '101', capacity: 2, monthlyRent: 3000, ...body });
  expect(res.status).toBe(201);
  return res.body.room;
};
const createTenant = async (body = {}) => {
  const res = await api('post', '/tenants', admin).send({ name: 'Maria Santos', email: 'maria@test.local', password: 'Tenant123', ...body });
  expect(res.status).toBe(201);
  return res.body.tenant;
};

describe('sign-in and permissions', () => {
  test('requires a valid Firebase token and the right role', async () => {
    expect((await request(app).get('/api/v1/rooms')).status).toBe(401);
    expect((await api('get', '/rooms', 'not-a-token')).status).toBe(401);
    await createTenant();
    const tenant = await signIn('maria@test.local', 'Tenant123');
    expect((await api('get', '/bills', tenant)).status).toBe(403);
    expect((await api('get', '/activity', tenant)).status).toBe(403);
    const me = await api('get', '/auth/me', tenant);
    expect(me.body.user.role).toBe('TENANT');
    expect(me.body.tenant.name).toBe('Maria Santos');
  });

  test('new tenants get a temporary password and must change it', async () => {
    const res = await api('post', '/tenants', admin).send({ name: 'Juan Dela Cruz', email: 'juan@test.local' });
    // 12 random characters in three groups, with an uppercase letter, a lowercase letter and a number.
    expect(res.body.temporaryPassword).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
    expect(res.body.temporaryPassword).toMatch(/[A-Z]/);
    expect(res.body.temporaryPassword).toMatch(/[a-z]/);
    expect(res.body.temporaryPassword).toMatch(/[0-9]/);
    const token = await signIn('juan@test.local', res.body.temporaryPassword);
    expect((await api('get', '/auth/me', token)).body.user.mustChangePassword).toBe(true);
    await api('post', '/auth/password-changed', token).expect(200);
    expect((await api('get', '/auth/me', token)).body.user.mustChangePassword).toBe(false);
  });

  test('deactivated tenants are locked out immediately', async () => {
    const t = await createTenant();
    const token = await signIn('maria@test.local', 'Tenant123');
    await api('get', '/me/home', token).expect(200);
    await api('post', `/tenants/${t._id}/deactivate`, admin).send({ reason: 'Left' }).expect(200);
    expect((await api('get', '/me/home', token)).status).toBe(401);
  });
});

describe('rooms and occupancy', () => {
  test('status and spaces follow occupancy; capacity enforced', async () => {
    const room = await createRoom({ capacity: 2, amenities: ['Wi-Fi', 'Bed'] });
    expect(room.status).toBe('AVAILABLE');
    expect(room.amenities).toEqual(['Wi-Fi', 'Bed']);
    const t1 = await createTenant({ email: 'a@t.local', roomId: room._id });
    const t2 = await createTenant({ email: 'b@t.local' });
    const t3 = await createTenant({ email: 'c@t.local' });
    let r = await api('get', `/rooms/${room._id}`, admin);
    expect(r.body.room.status).toBe('PARTIALLY_OCCUPIED');
    await api('post', `/tenants/${t2._id}/assign`, admin).send({ roomId: room._id }).expect(201);
    r = await api('get', `/rooms/${room._id}`, admin);
    expect(r.body.room.status).toBe('FULL');
    expect(r.body.room.availableBeds).toBe(0);
    expect((await api('post', `/tenants/${t3._id}/assign`, admin).send({ roomId: room._id })).status).toBe(409);
    expect((await api('patch', `/rooms/${room._id}`, admin).send({ capacity: 1 })).status).toBe(400);
    await api('post', `/tenants/${t1._id}/move-out`, admin).send({}).expect(200);
    r = await api('get', `/rooms/${room._id}`, admin);
    expect(r.body.room.status).toBe('PARTIALLY_OCCUPIED');
    const list = await api('get', '/rooms', admin);
    expect(list.body.items[0].occupants.map((o) => o.name)).toEqual(['Maria Santos']);
  });

  test('two assignments to the last bed at once: only one wins', async () => {
    const room = await createRoom({ capacity: 1 });
    const a = await createTenant({ email: 'a@t.local' });
    const b = await createTenant({ email: 'b@t.local' });
    const results = await Promise.all([a, b].map((t) => api('post', `/tenants/${t._id}/assign`, admin).send({ roomId: room._id })));
    expect(results.map((x) => x.status).sort()).toEqual([201, 409]);
    expect((await api('get', `/rooms/${room._id}`, admin)).body.room.occupiedBeds).toBe(1);
  });

  test('transfer keeps history; duplicate room numbers refused; photos stored', async () => {
    const a = await createRoom({ roomNumber: 'A1', capacity: 1 });
    const b = await createRoom({ roomNumber: 'B1', capacity: 2, monthlyRent: 2500 });
    expect((await api('post', '/rooms', admin).send({ roomNumber: 'a1', capacity: 1, monthlyRent: 1 })).status).toBe(409);
    const t = await createTenant({ roomId: a._id });
    await api('post', `/tenants/${t._id}/transfer`, admin).send({ roomId: b._id }).expect(200);
    const d = await api('get', `/tenants/${t._id}`, admin);
    expect(d.body.assignments).toHaveLength(2);
    expect(d.body.tenant.currentRoomNumber).toBe('B1');
    expect(d.body.tenant.monthlyRent).toBe(2500);
    expect((await api('get', `/rooms/${a._id}`, admin)).body.room.status).toBe('AVAILABLE');

    const up = await api('post', `/rooms/${b._id}/photos`, admin).attach('photos', PNG, { filename: 'r.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    const url = up.body.room.photos[0].url;
    expect(url).toMatch(/^\/api\/v1\/files\/rooms\//);
    const img = await request(app).get(url);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect((await api('post', `/rooms/${b._id}/photos`, admin).attach('photos', Buffer.from('fake'), { filename: 'x.png', contentType: 'image/png' })).status).toBe(400);
  });
});

describe('electricity', () => {
  test('meter readings, sharing methods and validation', async () => {
    const room = await createRoom({ capacity: 3 });
    const t1 = await createTenant({ email: 'a@t.local', roomId: room._id, moveInDate: '2026-01-01' });
    const t2 = await createTenant({ name: 'Juan', email: 'b@t.local', roomId: room._id, moveInDate: '2026-03-16' });
    const base = { roomId: room._id, billingYear: 2026, billingMonth: 3 };

    const p = await api('post', '/electricity/preview', admin).send({ ...base, previousReading: 12500, currentReading: 12800, rate: 15, sharingMethod: 'EQUAL' });
    expect(p.body.preview.consumption).toBe(300);
    expect(p.body.preview.totalCost).toBe(4500);
    expect(p.body.preview.shares.map((s) => s.amount)).toEqual([2250, 2250]);

    const pr = await api('post', '/electricity/preview', admin).send({ ...base, previousReading: 0, currentReading: 100, rate: 12.5, sharingMethod: 'PRORATED' });
    expect(pr.body.preview.shares.reduce((a, s) => a + s.amount, 0)).toBeCloseTo(1250, 2);

    const im = await api('post', '/electricity/preview', admin).send({
      ...base,
      sharingMethod: 'INDIVIDUAL_METER',
      rate: 10,
      tenantMeters: [
        { tenantId: t1._id, previousReading: 100, currentReading: 150 },
        { tenantId: t2._id, previousReading: 20, currentReading: 30 },
      ],
    });
    expect(im.body.preview.totalCost).toBe(600);
    expect(im.body.preview.shares.find((s) => s.tenantId === t1._id).amount).toBe(500);

    const bad = await api('post', '/electricity', admin).send({ ...base, mode: 'MANUAL', totalCost: 900, sharingMethod: 'CUSTOM', shares: [{ tenantId: t1._id, amount: 400 }] });
    expect(bad.status).toBe(400);

    expect((await api('post', '/electricity', admin).send({ ...base, previousReading: 500, currentReading: 20, rate: 10 })).status).toBe(400);
    const corr = await api('post', '/electricity', admin).send({ ...base, previousReading: 500, currentReading: 20, rate: 10, isCorrection: true, correctionReason: 'Meter replaced' });
    expect(corr.status).toBe(201);
    expect((await api('post', '/electricity', admin).send({ ...base, previousReading: 1, currentReading: 2 })).status).toBe(409);
    const next = await api('post', '/electricity/preview', admin).send({ ...base, billingMonth: 4, currentReading: 70, rate: 10 });
    expect(next.body.preview.previousReading).toBe(20);
  });
});

describe('bills and payments: full owner and tenant workflow', () => {
  test('create, send, tenant pays, owner verifies, receipt', async () => {
    const room = await createRoom({ capacity: 2, monthlyRent: 2500 });
    const maria = await createTenant({ roomId: room._id, moveInDate: '2026-01-01' });
    const juan = await createTenant({ name: 'Juan Dela Cruz', email: 'juan@test.local', roomId: room._id, moveInDate: '2026-01-01' });
    await api('patch', '/settings', admin).send({ waterEnabled: true, waterChargePerTenant: 150, defaultDueDay: 10 }).expect(200);
    await api('post', '/electricity', admin).send({ roomId: room._id, billingYear: 2026, billingMonth: 12, previousReading: 0, currentReading: 60, rate: 15 }).expect(201);

    const gen = await api('post', '/bills/generate', admin).send({ billingYear: 2026, billingMonth: 12 });
    expect(gen.body.createdCount).toBe(2);
    const mBill = gen.body.created.find((b) => b.tenantId === maria._id);
    expect([mBill.rent, mBill.electricity, mBill.water, mBill.totalAmount, mBill.state]).toEqual([2500, 450, 150, 3100, 'DRAFT']);
    expect((await api('post', '/bills/generate', admin).send({ billingYear: 2026, billingMonth: 12 })).body.skipped).toHaveLength(2);

    const mariaToken = await signIn('maria@test.local', 'Tenant123');
    expect((await api('get', '/me/bills', mariaToken)).body.items).toHaveLength(0); // not sent yet

    const edit = await api('patch', `/bills/${mBill._id}`, admin).send({ adjustments: [{ label: 'Early bird', amount: -100 }] });
    expect(edit.body.bill.totalAmount).toBe(3000);
    expect(edit.body.bill.discount).toBe(100);
    await api('patch', `/rooms/${room._id}`, admin).send({ monthlyRent: 9999 }).expect(200); // old bills keep their rent
    await api('post', '/bills/publish', admin).send({ billingYear: 2026, billingMonth: 12 }).expect(200);

    const mine = await api('get', '/me/bills', mariaToken);
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0].rent).toBe(2500);
    expect((await api('patch', `/bills/${mBill._id}`, admin).send({ rent: 1 })).status).toBe(400);

    const jBill = gen.body.created.find((b) => b.tenantId === juan._id);
    expect((await api('get', `/me/bills/${jBill._id}`, mariaToken)).status).toBe(404); // someone else's bill

    const claim = await api('post', '/me/payments', mariaToken)
      .field('billId', mBill._id)
      .field('amount', '2000')
      .field('paymentMethod', 'GCASH')
      .field('referenceNumber', 'GC-WEB 123')
      .attach('proof', PNG, { filename: 'proof.png', contentType: 'image/png' });
    expect(claim.status).toBe(201);
    expect(claim.body.payment.status).toBe('PENDING_VERIFICATION');
    expect(claim.body.payment.hasProof).toBe(true);
    expect(JSON.stringify(claim.body)).not.toContain('payment-proofs/'); // storage paths never sent
    let bill = await api('get', `/bills/${mBill._id}`, admin);
    expect(bill.body.bill.amountPaid).toBe(0); // a screenshot alone does not pay the bill

    expect((await api('post', '/me/payments', mariaToken).send({ billId: mBill._id, amount: 100, paymentMethod: 'GCASH', referenceNumber: 'gc-web123' })).status).toBe(409);
    expect((await api('post', '/me/payments', mariaToken).send({ billId: mBill._id, amount: 99999, paymentMethod: 'CASH' })).status).toBe(400);

    const juanToken = await signIn('juan@test.local', 'Tenant123');
    expect((await api('get', `/me/payments/${claim.body.payment._id}/proof`, juanToken)).status).toBe(404);
    const own = await api('get', `/me/payments/${claim.body.payment._id}/proof`, mariaToken);
    expect(own.status).toBe(200);
    expect((await api('get', `/payments/${claim.body.payment._id}/proof`, admin)).status).toBe(200);

    const [c1, c2] = await Promise.all([
      api('post', `/payments/${claim.body.payment._id}/confirm`, admin).send({}),
      api('post', `/payments/${claim.body.payment._id}/confirm`, admin).send({}),
    ]);
    expect([c1.status, c2.status].sort()).toEqual([200, 409]); // applied exactly once
    bill = await api('get', `/bills/${mBill._id}`, admin);
    expect([bill.body.bill.amountPaid, bill.body.bill.remainingBalance, bill.body.bill.status]).toEqual([2000, 1000, 'PARTIALLY_PAID']);

    const receipt = await api('get', `/me/payments/${claim.body.payment._id}/receipt.pdf`, mariaToken);
    expect(receipt.status).toBe(200);
    expect(receipt.headers['content-type']).toContain('pdf');

    const cash = await api('post', '/payments', admin).send({ tenantId: maria._id, billId: mBill._id, amount: 1000, paymentMethod: 'CASH' });
    expect(cash.body.payment.receiptNumber).toMatch(/^OR-/);
    bill = await api('get', `/bills/${mBill._id}`, admin);
    expect(bill.body.bill.status).toBe('PAID');

    await api('post', `/payments/${cash.body.payment._id}/reverse`, admin).send({ reason: 'Recorded twice' }).expect(200);
    expect((await api('get', `/bills/${mBill._id}`, admin)).body.bill.remainingBalance).toBe(1000);

    // Rejection with a selectable reason; the reference can be resent.
    const c2b = await api('post', '/me/payments', mariaToken).send({ billId: mBill._id, amount: 500, paymentMethod: 'BANK_TRANSFER', referenceNumber: 'BDO-1' });
    const rej = await api('post', `/payments/${c2b.body.payment._id}/reject`, admin).send({ reasonCode: 'INVALID_REFERENCE' });
    expect(rej.body.payment.rejectionReason).toBe('Invalid reference number');
    expect((await api('post', '/me/payments', mariaToken).send({ billId: mBill._id, amount: 500, paymentMethod: 'BANK_TRANSFER', referenceNumber: 'BDO-1' })).status).toBe(201);

    // Dashboard and Activity History
    const dash = await api('get', '/dashboard', admin);
    expect(dash.body.cards.totalRooms).toBe(1);
    expect(dash.body.cards.occupiedSpaces).toBe(2);
    expect(dash.body.attention.find((a) => a.key === 'pending').text).toBe('1 payment waiting for verification');
    const act = await api('get', '/activity', admin);
    const titles = act.body.items.map((i) => i.title);
    expect(titles).toEqual(expect.arrayContaining(['Payment Submitted', 'Payment Confirmed', 'Payment Rejected', 'Bills Created', 'Tenant Added', 'Room Added']));
    const json = JSON.stringify(act.body.items.map(({ link, key, ...rest }) => rest));
    for (const bad of ['payment.submit', 'clientRequestId', 'technical', 'before', 'entityId']) expect(json).not.toContain(bad);
  });

  test('oldest bills paid first, overdue marking and reminders, no overpayment', async () => {
    const { runReminders } = require('../src/services/scheduler.service');
    const room = await createRoom({ monthlyRent: 1000, capacity: 1 });
    const t = await createTenant({ roomId: room._id, moveInDate: '2026-01-01' });
    await api('post', '/bills/generate', admin).send({ billingYear: 2026, billingMonth: 1, dueDate: '2026-01-10' });
    await api('post', '/bills/publish', admin).send({ billingYear: 2026, billingMonth: 1 });
    const feb = await api('post', '/bills/generate', admin).send({ billingYear: 2026, billingMonth: 2, dueDate: '2026-02-10' });
    expect(feb.body.created[0].previousBalance).toBe(1000);
    await api('post', '/bills/publish', admin).send({ billingYear: 2026, billingMonth: 2 });
    // Already past due when sent, so both are overdue immediately.
    const sent = await api('get', `/bills?tenantId=${t._id}`, admin);
    expect(sent.body.items.map((b) => b.status)).toEqual(['OVERDUE', 'OVERDUE']);
    const r1 = await runReminders(new Date('2026-02-12T02:00:00Z'));
    expect(r1.overdue).toBeGreaterThan(0);
    const r2 = await runReminders(new Date('2026-02-12T03:00:00Z'));
    expect(r2.overdue).toBe(0); // each reminder only once
    const pay = await api('post', '/payments', admin).send({ tenantId: t._id, billId: feb.body.created[0]._id, amount: 1500, paymentMethod: 'CASH' });
    expect(pay.body.payment.allocations).toHaveLength(2);
    expect((await api('post', '/payments', admin).send({ tenantId: t._id, amount: 999, paymentMethod: 'CASH' })).status).toBe(400);
  });

  test('reports in all formats; announcements to selected tenants', async () => {
    const room = await createRoom();
    const t = await createTenant({ roomId: room._id, moveInDate: '2026-01-01' });
    await createTenant({ name: 'Other', email: 'o@t.local' });
    await api('post', '/bills/generate', admin).send({ billingYear: 2026, billingMonth: 3 });
    await api('post', '/bills/publish', admin).send({ billingYear: 2026, billingMonth: 3 });
    for (const type of ['monthly-collection', 'monthly-billing', 'payment-history', 'outstanding', 'overdue', 'occupancy', 'tenant-list', 'electricity']) {
      const r = await api('get', `/reports/${type}`, admin);
      expect(r.status).toBe(200);
    }
    expect((await api('get', `/reports/tenant-statement?tenantId=${t._id}`, admin)).body.report.rows).toHaveLength(1);
    expect((await api('get', '/reports/monthly-billing?format=xlsx', admin)).headers['content-type']).toContain('spreadsheetml');
    expect((await api('get', '/reports/occupancy?format=pdf', admin)).headers['content-type']).toContain('pdf');

    const ann = await api('post', '/announcements', admin).send({ title: 'Hello', body: 'Only for you', audience: 'TENANTS', tenantIds: [t._id] });
    expect(ann.body.announcement.recipientCount).toBe(1);
    const mine = await api('get', '/me/announcements', await signIn('maria@test.local', 'Tenant123'));
    expect(mine.body.items).toHaveLength(1);
    const other = await api('get', '/me/announcements', await signIn('o@t.local', 'Tenant123'));
    expect(other.body.items).toHaveLength(0);
  });
});
