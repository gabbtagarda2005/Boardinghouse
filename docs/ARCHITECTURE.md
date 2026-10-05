# Boarding House Management System: Architecture

## 1. System overview

```
┌──────────────────────┐  ID token  ┌───────────────────────────────┐ Admin SDK ┌────────────────────────┐
│  Admin Web (React)   │──────────► │  Backend API (Node/Express)   │──────────►│ Firebase               │
│  Firebase JS SDK     │  HTTPS/WS  │  REST /api/v1 + Socket.IO     │           │  • Authentication      │
│  (sign-in only)      │◄────────── │  verifies token + role,       │           │  • Cloud Firestore     │
└──────────┬───────────┘            │  Zod validation, all money    │           │  • Cloud Storage       │
           │ sign in                │  maths, PDF/Excel, cron jobs  │           │  • Cloud Messaging     │
           ▼                        └───────────────────────────────┘           │  • App Check           │
   Firebase Authentication                        ▲                             └────────────────────────┘
           ▲                                      │ ID token (+ App Check token)
           │ sign in            ┌─────────────────┴────┐
           └────────────────────│ Tenant App (Flutter) │◄── FCM push (real project only)
                                └──────────────────────┘
```

* **Sign-in** happens in the apps with Firebase Authentication (email + password). The apps send the Firebase **ID token** to the backend as `Authorization: Bearer <token>`.
* **Roles** are Firebase custom claims: `role: "ADMIN"` (owner) or `role: "TENANT"`. Only the backend (Admin SDK) can set them.
  Every request is checked twice: the backend verifies the token, the claim, and the user's status in `users/{uid}`
  (deactivated users are blocked immediately), and the Firestore/Storage security rules enforce the same roles for any direct access.
* **All writes go through the backend.** The clients hold only the public Firebase config. The service-account key
  exists only on the server. Tenants never pass their own id: the server uses the uid from the verified token.
* **Money** is stored in pesos rounded to 2 decimals and computed only in `services/billing.service.js` and `payment.service.js`.
* **Financial writes** (confirm payment, generate/publish bills, assign/transfer tenants) run in Firestore **transactions**.

## 2. Firestore collections

```
users/{uid} ──1:1── tenants/{uid} ──1:*── roomAssignments ──*:1── rooms
                        │                                           │
                        └──1:*── bills ◄────────── electricityReadings/{roomId}_{YYYY-MM}
                                   ▲
                    payments ──allocations[]──┘

notifications (per user)    announcements ──fan-out──► notifications
activityHistory             settings/global
counters (receipt numbers, tenant codes)    uniques (duplicate locks)
```

| Collection | Key fields | Notes |
|---|---|---|
| `users/{uid}` | role (`ADMIN`/`TENANT`), name, email, phone, status (`ACTIVE`/`INACTIVE`), mustChangePassword, fcmTokens[] | Document id = Firebase Auth uid |
| `tenants/{uid}` | tenantCode, name, email, phone, address, occupation, birthDate, emergencyContact, status (`ACTIVE`/`MOVED_OUT`/`INACTIVE`), moveInDate, moveOutDate, currentRoomId, currentRoomNumber, currentBedNumber, currentAssignmentId, monthlyRent | Same id as the user |
| `rooms` | roomNumber, name, building, capacity, monthlyRent, description, amenities[], photos[], underMaintenance, occupiedBeds, status (`AVAILABLE`/`PARTIALLY_OCCUPIED`/`FULL`/`MAINTENANCE`), isArchived | Status is derived from occupancy. **No rating or review fields** |
| `roomAssignments` | tenantId, tenantName, roomId, roomNumber, bedNumber, startDate, endDate, monthlyRent (snapshot), status (`ACTIVE`/`ENDED`), endReason | Never deleted; a transfer ends one and starts another |
| `electricityReadings/{roomId}_{YYYY-MM}` | roomId, billingYear, billingMonth, mode, previousReading, currentReading, consumption, rate, totalCost, sharingMethod (`EQUAL`/`PRORATED`/`CUSTOM`/`INDIVIDUAL_METER`), shares[{tenantId, days, amount}], tenantMeters[], isCorrection, locked | One per room per month (enforced by the document id) |
| `bills` | billNumber, tenantId, roomId, roomNumber, bedNumber, tenantName, billingYear, billingMonth, rent, electricity (+ electricityDetail), water, otherCharges[], adjustments[], discount, totalAmount, amountPaid, remainingBalance, previousBalance, dueDate, state (`DRAFT`/`PUBLISHED`/`VOID`), status (`UNPAID`/`PARTIALLY_PAID`/`PAID`/`OVERDUE`) | One per tenant per month (lock `bill:tenant:YYYY-MM`). Drafts are invisible to tenants |
| `payments` | tenantId, billId, amount, paymentMethod (`GCASH`/`MAYA`/`BANK_TRANSFER`/`CASH`/`OTHER`), provider, referenceNumber, paymentDate, proof {path, contentType}, status (`PENDING_VERIFICATION`/`CONFIRMED`/`REJECTED`/`REVERSED`), source (`TENANT`/`ADMIN`), allocations[{billId, billingYear, billingMonth, amount}], submittedAt, verifiedAt, verifiedBy, receiptNumber, rejectionReason | Duplicate reference numbers, double submissions and double confirmation are blocked |
| `notifications` | userId, type, title, message, data, readAt, createdAt | Reminder ids are derived from bill + stage, so each reminder is sent once |
| `announcements` | title, body, audience (`ALL`/`ROOMS`/`TENANTS`), roomIds[], recipientIds[], audienceText, pinned, createdBy | Fanned out as notifications |
| `activityHistory` | action, category, actorName, entityType, entityId, summary, details, reason, technical{before, after, ip}, createdAt | Shown to the owner as plain-language **Activity History**. The technical part is never displayed |
| `settings/global` | house info, defaultDueDay, electricityRate, defaultElectricitySharing, water, defaultOtherCharges, paymentInstructions, paymentChannels[], notification preferences | |
| `counters`, `uniques` | sequence numbers; sha256-named lock documents | Internal (backend only; rules deny all client access) |

Composite indexes are in `firebase/firestore.indexes.json` (bills by tenant and month, payments by status and date, notifications by user and date, activity by category and date, …).

**Historical integrity.** Bills snapshot the tenant name, room number and rent when generated. Later rent changes or transfers never rewrite past bills.
Published bills change only through recorded adjustments with a reason. Bills with confirmed payments can't be voided, and payments are reversed, never deleted.

## 3. Cloud Storage folders

| Path | Who can read | Who can write |
|---|---|---|
| `payment-proofs/{tenantId}/…` | that tenant, the owner | that tenant (image or PDF ≤ 5 MB; the app uploads through the API) |
| `room-images/{roomId}/…` | any signed-in user | owner (image ≤ 5 MB) |
| `receipts/{tenantId}/…` | that tenant, the owner | backend only |
| `tenant-documents/{tenantId}/…` | that tenant, the owner | owner (≤ 10 MB) |
| `profile-images/{uid}/…` | any signed-in user | that user or the owner (image ≤ 2 MB) |

Uploaded files are checked by content (not just by name) on the backend. Proofs and receipts are streamed through the API after an ownership check; they are never public.

## 4. Security rules (summary)

`firebase/firestore.rules` and `firebase/storage.rules` deny everything by default, then allow:
* the owner (`role == 'ADMIN'`) to read everything except internal collections;
* a tenant to read only their own `users`/`tenants` record, their current room, their own **published** bills and payments, their own notifications (and mark them read), and announcements addressed to them;
* no client writes to financial data. The backend's Admin SDK bypasses rules and does its own role checks.

The rules are tested in `firebase/tests/rules.test.js` (`npm run test:rules`).

## 5. Key workflows

**Billing.** `POST /bills/generate {billingYear, billingMonth}` creates **draft** bills for every tenant with an active assignment.
Rent comes from the assignment snapshot, electricity from that room's reading shares, and water and other charges from settings.
The owner reviews and edits drafts (totals are recomputed on the server). `POST /bills/publish` sends them to tenants and locks the readings used.

**Electricity.** Consumption = current − previous reading, and cost = consumption × rate. The room's cost is shared by the chosen method:
* `EQUAL`: split equally among the tenants who stayed in the room that month
* `PRORATED`: split by the number of days each tenant stayed
* `CUSTOM`: the owner sets each tenant's amount (must add up to the total)
* `INDIVIDUAL_METER`: each tenant's own sub-meter reading × rate

**Payments.** A tenant sends payment details (amount, method, reference number, receipt photo): the status is **Waiting for verification** and no balance changes.
The owner confirms or rejects it (with a reason such as *Incorrect amount* or *Invalid reference number*). Confirmation is a single transaction:
it applies the amount to the chosen bill first and then the oldest unpaid bills, updates balances and statuses, issues a receipt number (`OR-YYYY-#####`),
stores the receipt PDF, records Activity History, and notifies the tenant. The owner can also record cash payments directly (confirmed immediately).
A screenshot alone never marks a bill as paid.

**Notifications.** Every notification is stored in Firestore. It is pushed live to the admin web over Socket.IO, and to phones by FCM when a real project is configured.
The tenant app also checks regularly, so nothing is missed without FCM. A daily job marks overdue bills and sends due-soon and overdue reminders.

**Cost awareness.** Lists are paginated, dashboard totals use `count()` aggregations where possible, settings and user lookups are cached briefly on the server,
and the apps don't keep open Firestore listeners (they use the API, real-time sockets for the owner, and periodic checks on the phone).

## 6. Folder structure

```
backend/src/
  config/       env.js, firebase.js (Admin SDK init, emulator detection)
  db/           collection names, document conversion, counters, uniqueness locks
  middleware/   auth (ID token + role + App Check), validate, upload, error, rateLimit
  validators/   Zod schemas
  services/     billing, electricity, occupancy, payment, notification, audit, activity, report, pdf, dashboard, storage, scheduler, accounts, settings
  controllers/  auth, room, tenant, billing (electricity/bills/payments), misc, me (tenant)
  routes/       index.js
  seed/         seed.js (development sample data), createAdmin.js
backend/tests/  workflow + unit tests (run on the emulators)
admin-web/src/  lib/firebase.js, api/, context/, hooks/, components/ (ui kit, cards, layout, modals), pages/, utils/
tenant-mobile/lib/  core/ (config, api client, push, theme, format), models/, providers/, screens/, widgets/ (cards, common)
firebase/       firestore.rules, storage.rules, firestore.indexes.json, tests/
scripts/        setup-java.js, with-java.js (emulator tooling)
```
