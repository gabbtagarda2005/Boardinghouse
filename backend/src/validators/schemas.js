const { z } = require('zod');
const { PAYMENT_METHODS, REJECTION_REASONS } = require('../constants');

const id = z.string().regex(/^[A-Za-z0-9_-]{6,128}$/, 'Invalid id');
const idParam = z.object({ id });
const money = z.coerce.number({ error: 'Please enter an amount' }).finite().min(0, 'The amount cannot be negative').max(10_000_000).transform((n) => Math.round(n * 100) / 100);
const signedMoney = z.coerce.number().finite().min(-10_000_000).max(10_000_000).transform((n) => Math.round(n * 100) / 100);
const year = z.coerce.number().int().min(2000).max(2100);
const month = z.coerce.number().int().min(1).max(12);
const text = (max) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));
const date = z.coerce.date({ error: 'Please enter a valid date' });
const phone = z.string().trim().regex(/^[0-9+()\-\s]{7,20}$/, 'Please enter a valid phone number');
const optPhone = phone.optional().or(z.literal('').transform(() => ''));
const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128)
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[0-9]/, 'Include a number');
const boolish = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean());
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
const method = z.enum(PAYMENT_METHODS);
const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  search: z.string().trim().max(100).optional(),
});
const emergency = z.object({ name: text(120), phone: text(30), relationship: text(60) }).optional();

const auth = {
  device: z.object({ token: z.string().min(10).max(4096) }),
  register: z.object({
    name: z.string().trim().min(2, 'Please enter your full name').max(120),
    phone: optPhone,
    requestedRoom: text(30),
    requestedMoveIn: date.optional().or(z.literal('').transform(() => undefined)),
    occupation: text(120),
    address: text(300),
    birthDate: date.optional().or(z.literal('').transform(() => undefined)),
    emergencyContact: z
      .object({ name: text(120), relationship: text(60), phone: text(30) })
      .partial()
      .optional(),
  }),
};

const roomBase = {
  roomNumber: z.string().trim().min(1, 'Please enter the room number').max(30),
  name: text(100),
  building: text(60),
  capacity: z.coerce.number().int().min(1, 'A room needs at least 1 bed').max(50),
  monthlyRent: money,
  description: text(2000),
  amenities: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  underMaintenance: boolish.optional(),
};
const rooms = {
  create: z.object(roomBase),
  update: z.object(roomBase).partial(),
  list: listQuery.extend({ status: z.string().max(30).optional(), archived: z.enum(['true', 'false', 'all']).optional() }),
};

const tenants = {
  create: z.object({
    name: z.string().trim().min(2, 'Please enter the full name').max(120),
    email: z.email('Please enter a valid email').trim().toLowerCase(),
    phone: optPhone,
    password: password.optional(),
    address: text(300),
    occupation: text(120),
    birthDate: date.optional(),
    emergencyContact: emergency,
    notes: text(1000),
    moveInDate: date.optional(),
    roomId: id.optional(),
    bedNumber: z.coerce.number().int().min(1).optional(),
    monthlyRent: money.optional(),
  }),
  update: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.email().trim().toLowerCase().optional(),
    phone: optPhone,
    address: text(300),
    occupation: text(120),
    birthDate: date.optional().nullable(),
    emergencyContact: emergency,
    notes: text(1000),
    moveInDate: date.optional(),
  }),
  list: listQuery.extend({ status: z.enum(['ACTIVE', 'MOVED_OUT', 'INACTIVE', 'PENDING', 'REJECTED', 'ALL']).optional(), roomId: id.optional(), unassigned: z.enum(['true', 'false']).optional() }),
  assign: z.object({ roomId: id, bedNumber: z.coerce.number().int().min(1).optional(), startDate: date.optional(), monthlyRent: money.optional(), notes: text(500) }),
  transfer: z.object({ roomId: id, bedNumber: z.coerce.number().int().min(1).optional(), date: date.optional(), monthlyRent: money.optional(), reason: text(500) }),
  moveOut: z.object({ date: date.optional(), reason: text(500) }),
  deactivate: z.object({ reason: z.string().trim().min(3, 'Please give a reason').max(500) }),
  resetPassword: z.object({ newPassword: password.optional() }),
  /** Approving a sign-up means giving them their real room and bed. */
  reject: z
    .object({ reason: z.enum(['NOT_VERIFIED', 'DUPLICATE', 'NO_TENANCY', 'OTHER'], 'Please choose a reason'), note: text(300) })
    .refine((v) => v.reason !== 'OTHER' || (v.note && v.note.trim().length >= 3), { message: 'Please write the reason', path: ['note'] }),
  approve: z.object({ roomId: id.optional(), bedNumber: z.coerce.number().int().min(1).optional(), startDate: date.optional(), monthlyRent: money.optional() }),
};

const electricityBase = z.object({
  roomId: id,
  billingYear: year,
  billingMonth: month,
  mode: z.enum(['METER', 'MANUAL']).default('METER'),
  previousReading: z.coerce.number().min(0).max(100_000_000).optional(),
  currentReading: z.coerce.number().min(0).max(100_000_000).optional(),
  rate: money.optional(),
  totalCost: money.optional(),
  consumption: z.coerce.number().optional(),
  sharingMethod: z.enum(['EQUAL', 'PRORATED', 'CUSTOM', 'INDIVIDUAL_METER']).optional(),
  shares: z.array(z.object({ tenantId: id, amount: money })).max(60).optional(),
  tenantMeters: z
    .array(z.object({ tenantId: id, previousReading: z.coerce.number().min(0).max(100_000_000).optional(), currentReading: z.coerce.number().min(0).max(100_000_000) }))
    .max(60)
    .optional(),
  isCorrection: z.boolean().optional(),
  correctionReason: text(500),
  readingDate: date.optional(),
  notes: text(500),
});
const electricity = {
  create: electricityBase,
  preview: electricityBase,
  update: electricityBase.omit({ roomId: true, billingYear: true, billingMonth: true }).partial(),
  list: listQuery.extend({ billingYear: year.optional(), billingMonth: month.optional(), roomId: id.optional() }),
  occupants: z.object({ roomId: id, billingYear: year, billingMonth: month }),
};

const line = z.object({ label: z.string().trim().min(1).max(120), amount: money });
const signedLine = z.object({ label: z.string().trim().min(1).max(120), amount: signedMoney });
const bills = {
  generate: z.object({ billingYear: year, billingMonth: month, dueDate: date.optional(), tenantIds: z.array(id).max(500).optional(), includeWater: z.boolean().optional() }),
  updateDraft: z.object({
    rent: money.optional(),
    electricity: money.optional(),
    water: money.optional(),
    otherCharges: z.array(line).max(30).optional(),
    adjustments: z.array(signedLine).max(30).optional(),
    dueDate: date.optional(),
    notes: text(1000),
    resetElectricity: z.boolean().optional(),
  }),
  adjust: z.object({
    label: z.string().trim().min(1).max(120),
    amount: signedMoney.refine((n) => n !== 0, 'The amount cannot be zero'),
    reason: z.string().trim().min(3, 'Please give a reason').max(500),
  }),
  publish: z
    .object({ billIds: z.array(id).max(1000).optional(), billingYear: year.optional(), billingMonth: month.optional() })
    .refine((v) => v.billIds?.length || (v.billingYear && v.billingMonth), 'Choose which bills to send'),
  void: z.object({ reason: z.string().trim().min(3, 'Please give a reason').max(500) }),
  list: listQuery.extend({
    billingYear: year.optional(),
    billingMonth: month.optional(),
    state: z.enum(['DRAFT', 'PUBLISHED', 'VOID', 'ALL']).optional(),
    status: z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE']).optional(),
    tenantId: id.optional(),
    roomId: id.optional(),
  }),
};

const notFuture = (d) => d <= new Date(Date.now() + 86400000);
const payments = {
  submit: z.object({
    billId: id.optional().or(z.literal('').transform(() => undefined)),
    amount: money.refine((n) => n > 0, 'Please enter the amount you paid'),
    paymentMethod: method,
    provider: text(60),
    referenceNumber: text(80),
    paymentDate: date.refine(notFuture, 'The payment date cannot be in the future').optional(),
    notes: text(500),
    clientRequestId: text(80),
  }),
  record: z.object({
    tenantId: id,
    billId: id.optional().or(z.literal('').transform(() => undefined)),
    amount: money.refine((n) => n > 0, 'Please enter the amount received'),
    paymentMethod: method,
    provider: text(60),
    referenceNumber: text(80),
    paymentDate: date.refine(notFuture, 'The payment date cannot be in the future').optional(),
    notes: text(500),
    clientRequestId: text(80),
  }),
  confirm: z.object({ amount: money.optional(), note: text(500) }),
  reject: z.object({ reasonCode: z.enum(Object.keys(REJECTION_REASONS)), note: text(500) }),
  reverse: z.object({ reason: z.string().trim().min(3, 'Please give a reason').max(500) }),
  list: listQuery.extend({
    status: z.enum(['PENDING_VERIFICATION', 'CONFIRMED', 'REJECTED', 'REVERSED', 'ALL']).optional(),
    paymentMethod: method.optional(),
    tenantId: id.optional(),
    billId: id.optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  }),
};

const inquiries = {
  create: z.object({
    name: z.string().trim().min(2, 'Please enter your name').max(120),
    phone: phone,
    email: z.union([z.email('Please enter a valid email').trim().toLowerCase(), z.literal('')]).optional(),
    school: text(120),
    moveIn: text(40),
    roomType: text(60),
    message: text(1000),
    website: z.string().max(300).optional(), // honeypot: hidden from people, bots fill it in
    // From the public room pages: the chosen room, when, and how many people.
    roomId: id.optional(),
    preferredMoveInDate: date.optional().or(z.literal('').transform(() => undefined)),
    numberOfOccupants: z.coerce.number().int().min(1, 'At least 1 person').max(20).optional(),
  }).superRefine((v, ctx) => {
    if (!v.roomId) return;
    if (!v.preferredMoveInDate) ctx.addIssue({ code: 'custom', path: ['preferredMoveInDate'], message: 'Please choose your preferred move-in date' });
    if (!v.numberOfOccupants) ctx.addIssue({ code: 'custom', path: ['numberOfOccupants'], message: 'Please enter how many people will stay' });
  }),
  update: z.object({ status: z.enum(['NEW', 'CONTACTED', 'RESERVED', 'CLOSED']).optional(), note: text(500) }),
  list: z.object({ status: z.enum(['NEW', 'CONTACTED', 'RESERVED', 'CLOSED', 'ALL']).optional() }),
};

const announcements = {
  create: z
    .object({
      title: z.string().trim().min(3, 'Please enter a title').max(160),
      body: z.string().trim().min(3, 'Please write a message').max(5000),
      audience: z.enum(['ALL', 'ROOMS', 'TENANTS']).default('ALL'),
      roomIds: z.array(id).max(200).optional(),
      tenantIds: z.array(id).max(500).optional(),
      pinned: z.boolean().optional(),
    })
    .refine((v) => v.audience === 'ALL' || (v.audience === 'ROOMS' ? v.roomIds?.length : v.tenantIds?.length), 'Please choose who should receive it'),
};

const notifications = { list: listQuery.extend({ unread: z.enum(['true', 'false']).optional() }) };

const channel = z.object({ paymentMethod: method, provider: text(60), accountName: text(120), accountNumber: text(60), instructions: text(500) });
const settings = {
  update: z
    .object({
      houseName: z.string().trim().min(1).max(120),
      address: z.string().trim().max(300),
      contactPhone: z.string().trim().max(30),
      contactEmail: z.union([z.email(), z.literal('')]),
      defaultDueDay: z.coerce.number().int().min(1).max(28),
      electricityRate: money,
      defaultElectricitySharing: z.enum(['EQUAL', 'PRORATED', 'CUSTOM', 'INDIVIDUAL_METER']),
      waterEnabled: z.boolean(),
      waterChargePerTenant: money,
      defaultOtherCharges: z.array(line).max(20),
      paymentInstructions: z.string().trim().max(2000),
      paymentChannels: z.array(channel).max(20),
      /** Optional custom download link for the tenant app (e.g. Play Store). Empty = this computer. */
      tenantAppUrl: z.union([z.url('Please enter a full web address (https://…)'), z.literal('')]),
      /** Days a temporary password works before the tenant must ask for a new one. */
      tempPasswordDays: z.coerce.number().int().min(1).max(30),
      /** Let people send an inquiry for a full room (a waiting list). */
      allowWaitlistInquiries: z.boolean(),
      notifications: z
        .object({
          notifyOnBillPublish: z.boolean(),
          notifyOnPaymentConfirm: z.boolean(),
          sendDueReminders: z.boolean(),
          reminderDaysBefore: z.array(z.coerce.number().int().min(0).max(30)).max(5),
          sendOverdueReminders: z.boolean(),
          overdueReminderEveryDays: z.coerce.number().int().min(1).max(30),
          pushEnabled: z.boolean(),
          emailNewTenants: z.boolean(),
        })
        .partial(),
    })
    .partial(),
};

const users = {
  updateMe: z.object({ name: z.string().trim().min(2).max(120).optional(), phone: optPhone }),
  createAdmin: z.object({ name: z.string().trim().min(2).max(120), email: z.email().trim().toLowerCase(), phone: phone.optional(), password }),
  tenantSelfUpdate: z.object({ phone: optPhone, address: text(300), occupation: text(120), emergencyContact: emergency }),
};

const reports = {
  query: z.object({
    format: z.enum(['json', 'xlsx', 'pdf']).optional(),
    fromPeriod: period.optional(),
    toPeriod: period.optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    search: z.string().trim().max(100).optional(),
    status: z.string().max(30).optional(),
    method: method.optional(),
    tenantId: id.optional(),
  }),
};

const activity = {
  list: listQuery.extend({
    category: z.enum(['payments', 'bills', 'tenants', 'rooms', 'electricity', 'announcements', 'account']).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  }),
};

module.exports = { id, idParam, listQuery, auth, rooms, tenants, electricity, bills, payments, inquiries, announcements, notifications, settings, users, reports, activity };
