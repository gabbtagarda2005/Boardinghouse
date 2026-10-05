# REST API Reference

Base URL: `/api/v1`. Bodies are JSON unless marked *multipart*. Money is in Philippine pesos (2 decimals). Dates are ISO strings.

**Authentication.** Sign in with Firebase Authentication in the app, then send the Firebase **ID token**:
`Authorization: Bearer <Firebase ID token>`. When App Check is enforced, also send `X-Firebase-AppCheck: <token>`.
The role comes from the token's custom claim (`ADMIN` or `TENANT`) and the account must be active.
There are no login, refresh or password endpoints in the API: Firebase handles sign-in, token refresh and password reset.

**Responses.** Success: `{ "success": true, ... }`. Error: `{ "success": false, "message": "<friendly message>", "details"?: [{ field, message }] }`.
Status codes: `400` invalid input, `401` not signed in or session expired, `403` wrong role or account deactivated, `404` not found
(also returned for another tenant's records), `409` conflict or duplicate, `429` too many requests.

Lists accept `page`, `limit` (≤ 500) and `search`, and return `{ items, total, page, limit, pages }`.

## Signed-in user

| Method | Path | Notes |
|---|---|---|
| GET | `/auth/me?login=1` | Current user (`role`, `name`, `email`, `mustChangePassword`, tenant profile for tenants). `login=1` records the sign-in in Activity History |
| POST | `/auth/password-changed` | Call after changing the password in Firebase. Clears `mustChangePassword` |
| POST / DELETE | `/auth/devices` | `{ token }`. Register or remove an FCM device token |
| PATCH | `/users/me` | `{ name?, phone? }` |
| GET | `/notifications?unread=true` | Own notifications only. Includes the `unread` count |
| POST | `/notifications/:id/read` · `/notifications/read-all` | |
| GET | `/health` | Public. `{ status: "ok" }` |

## Owner endpoints (role `ADMIN`)

### Dashboard
`GET /dashboard` returns `cards` (total rooms, occupied/available spaces, active tenants, unpaid and overdue bills, collected this month),
`attention` items (waiting payments, overdue bills, bills due soon, unsent drafts, missing readings, full rooms; each has a link),
`collection` (12 months billed vs collected), `dueSoon`, `pendingPayments`, `recentPayments`, `recentActivity` and `occupancy`.

### Rooms
| Method | Path | Notes |
|---|---|---|
| GET | `/rooms?status=&archived=false\|true\|all&search=` | |
| POST | `/rooms` | `{ roomNumber, name?, building?, capacity, monthlyRent, description?, amenities?[], underMaintenance? }` |
| GET | `/rooms/:id` | `{ room, occupants, beds[{bedNumber, occupied, assignment}], history }` |
| PATCH | `/rooms/:id` | Partial update. Capacity can't go below occupied beds. Rent changes don't touch existing assignments or bills |
| POST | `/rooms/:id/archive` · `/rooms/:id/restore` | Archiving requires an empty room |
| POST | `/rooms/:id/photos` | *multipart* `photos` (≤ 6, JPG/PNG/WEBP ≤ 5 MB, checked by content) |
| DELETE | `/rooms/:id/photos/:photoId` | |
| GET | `/files/rooms/:id/:photoId` | Public room photo |

Room `status`: `AVAILABLE`, `PARTIALLY_OCCUPIED`, `FULL`, `MAINTENANCE` (derived from occupancy). Rooms have no rating fields.

### Tenants
| Method | Path | Notes |
|---|---|---|
| GET | `/tenants?status=ACTIVE\|MOVED_OUT\|INACTIVE\|ALL&roomId=&unassigned=true&search=` | Search by name, room or phone. Each row includes `monthlyRent`, `balance`, `nextDueDate`, `paymentStatus` (`UP_TO_DATE`/`UNPAID`/`OVERDUE`/`WAITING_FOR_VERIFICATION`) |
| POST | `/tenants` | `{ name, email, phone?, password?, address?, occupation?, birthDate?, emergencyContact?, notes?, moveInDate?, roomId?, bedNumber?, monthlyRent? }`. Creates the Firebase account (role `TENANT`) and returns `temporaryPassword` once |
| GET | `/tenants/:id` | Profile, room history, bills, payments, balance |
| PATCH | `/tenants/:id` | Profile and contact fields |
| POST | `/tenants/:id/assign` | `{ roomId, bedNumber?, startDate?, monthlyRent?, notes? }`. Returns 409 when the room is full |
| POST | `/tenants/:id/transfer` | `{ roomId, bedNumber?, date?, monthlyRent?, reason? }`. Ends the old assignment and keeps history |
| POST | `/tenants/:id/move-out` | `{ date?, reason? }` |
| POST | `/tenants/:id/deactivate` · `/reactivate` | Deactivate: `{ reason }`. Disables sign-in and ends sessions |
| POST | `/tenants/:id/reset-password` | `{ newPassword? }` → `temporaryPassword` |

### Electricity
| Method | Path | Notes |
|---|---|---|
| GET | `/electricity?billingYear=&billingMonth=&roomId=` | |
| GET | `/electricity/occupants?roomId=&billingYear=&billingMonth=` | Tenants who stayed that month (with days), last reading, existing reading |
| POST | `/electricity/preview` | Same body as create. Returns `{ consumption, totalCost, shares[] }` without saving |
| POST | `/electricity` | `{ roomId, billingYear, billingMonth, mode: "METER"\|"MANUAL", previousReading?, currentReading?, rate?, totalCost?, sharingMethod?: "EQUAL"\|"PRORATED"\|"CUSTOM"\|"INDIVIDUAL_METER", shares?[{tenantId, amount}], tenantMeters?[{tenantId, previousReading?, currentReading}], isCorrection?, correctionReason?, readingDate?, notes? }` |
| PATCH / DELETE | `/electricity/:id` | Not allowed once the reading is used by a sent bill |

Consumption = current − previous. Cost = consumption × rate. A lower reading than last month is rejected unless it's marked as a correction with a reason.
`CUSTOM` shares must add up to the total. Saving a reading updates that month's draft bills.

### Bills
| Method | Path | Notes |
|---|---|---|
| GET | `/bills?billingYear=&billingMonth=&state=DRAFT\|PUBLISHED\|VOID\|ALL&status=&tenantId=&roomId=&search=` | Includes `totals` |
| GET | `/bills/summary?billingYear=&billingMonth=` | Draft and sent counts and totals |
| POST | `/bills/generate` | `{ billingYear, billingMonth, dueDate?, tenantIds?[], includeWater? }` → drafts (one per tenant per month) |
| POST | `/bills/publish` | `{ billIds?[] }` or `{ billingYear, billingMonth }`. Sends to tenants and notifies them |
| GET | `/bills/:id` | `{ bill, payments, history }` |
| PATCH | `/bills/:id` | Drafts only: `{ rent?, electricity?, water?, otherCharges?[], adjustments?[], dueDate?, notes?, resetElectricity? }` |
| POST | `/bills/:id/adjustments` | Sent bills only: `{ label, amount (negative = discount), reason }` |
| POST | `/bills/:id/void` | `{ reason }`. Not allowed when confirmed payments exist |
| POST | `/bills/:id/remind` | `{ message? }` |
| GET | `/bills/:id/statement.pdf` | |

Bill fields: `billNumber, billingYear, billingMonth, rent, electricity, electricityDetail, water, otherCharges[], adjustments[], discount, totalAmount, amountPaid, remainingBalance, previousBalance, dueDate, state, status`.
`status` is `UNPAID`, `PARTIALLY_PAID`, `PAID` or `OVERDUE`.

### Payments
| Method | Path | Notes |
|---|---|---|
| GET | `/payments?status=PENDING_VERIFICATION\|CONFIRMED\|REJECTED\|REVERSED\|ALL&paymentMethod=&tenantId=&billId=&from=&to=&search=` | Includes `statusCounts` |
| POST | `/payments` | Owner-recorded payment, confirmed immediately: `{ tenantId, billId?, amount, paymentMethod, provider?, referenceNumber?, paymentDate?, notes?, clientRequestId? }` |
| GET | `/payments/:id` | |
| POST | `/payments/:id/confirm` | `{ amount?, note? }` (a note is required if the amount differs). Confirming twice returns 409 |
| POST | `/payments/:id/reject` | `{ reasonCode: "INCORRECT_AMOUNT"\|"INVALID_REFERENCE"\|"UNCLEAR_PROOF"\|"NOT_VERIFIED"\|"OTHER", note? }` |
| POST | `/payments/:id/reverse` | `{ reason }`. Undoes a confirmed payment and restores balances |
| GET | `/payments/:id/proof` · `/payments/:id/receipt.pdf` | Streamed after a permission check; never public |

`paymentMethod`: `GCASH`, `MAYA`, `BANK_TRANSFER`, `CASH`, `OTHER`. A payment is applied to the chosen bill first, then the oldest unpaid bills. Overpayments are rejected.
Duplicates are blocked by method + reference number, by `clientRequestId`, and by unique receipt numbers (`OR-YYYY-#####`).

### Announcements, reports, settings, activity, owners
| Method | Path | Notes |
|---|---|---|
| GET / POST | `/announcements` | `{ title, body, audience: "ALL"\|"ROOMS"\|"TENANTS", roomIds?[], tenantIds?[], pinned? }`. Each recipient gets a notification |
| POST / DELETE | `/announcements/:id/pin` · `/announcements/:id` | |
| GET | `/reports/:type?format=json\|xlsx\|pdf&fromPeriod=YYYY-MM&toPeriod=&from=&to=&search=&status=&method=&tenantId=` | Types: `monthly-collection`, `monthly-billing`, `payment-history`, `outstanding`, `overdue`, `occupancy`, `tenant-list`, `electricity`, `tenant-statement` |
| GET / PATCH | `/settings` | Boarding house info, due day, electricity rate and default sharing, water, default charges, payment instructions and channels, notification preferences. GET also returns `features` (push, email) |
| GET | `/activity?category=payments\|bills\|tenants\|rooms\|electricity\|announcements\|account&from=&to=&search=` | Plain-language Activity History (title, description, person, done by, amount, date). No ids or technical data |
| POST | `/notifications/run-reminders` | Runs the daily reminder job now (safe to repeat) |
| GET / POST | `/users/admins` | List or add owner accounts `{ name, email, phone?, password }` |
| PATCH | `/users/admins/:id` | `{ isActive }` |

## Tenant endpoints (role `TENANT`, always limited to the signed-in tenant)

| Method | Path | Notes |
|---|---|---|
| GET | `/me/home` | Name, room and bed, current bill, outstanding balance, next due date, waiting payments, recent notifications |
| GET | `/me/room` | Room details, amenities, photos, own bed and rent, roommates' first names |
| GET | `/me/bills` · `/me/bills/:id` · `/me/bills/:id/statement.pdf` | Sent and cancelled bills only (drafts are never visible) |
| GET | `/me/payment-info` | Payment instructions, channels, unpaid bills (`remainingBalance`, `status`) |
| GET | `/me/payments` · `/me/payments/:id` | |
| POST | `/me/payments` | *multipart*: `billId?, amount, paymentMethod, provider?, referenceNumber (required unless CASH), paymentDate?, notes?, clientRequestId?, proof? (JPG/PNG/WEBP/PDF ≤ 5 MB)`. Created as `PENDING_VERIFICATION` |
| GET | `/me/payments/:id/proof` · `/me/payments/:id/receipt.pdf` | Own records only |
| GET | `/me/announcements` | |
| GET / PATCH | `/me/profile` | Tenants may change `phone, address, occupation, emergencyContact` only |

## Real-time (Socket.IO, admin web)

Connect to path `/socket.io` with `auth: { token: <Firebase ID token> }`. Events:
- `notification`: sent to the recipient
- `payment:pending`: sent to owners when a tenant submits a payment
