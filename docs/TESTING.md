# Testing

All automated tests run against the local **Firebase Emulator Suite**, never a real project.
Run `npm install` and `npm run setup:java` once in the project root first.

## Backend: `cd backend && npm test`

Starts temporary Auth, Firestore and Storage emulators, runs the tests, then shuts them down (any running `npm run emulators` must be stopped first, because the ports are shared).
Uses Node's built-in test runner and `supertest`. 14 tests:

- **Access:** a valid Firebase ID token and the right role are required (tenants get 403 on owner routes); new tenants get a temporary password and must change it; deactivated tenants are locked out immediately
- **Rooms:** status and available spaces follow occupancy, capacity is enforced, two simultaneous assignments to the last bed (only one succeeds), transfers keep history, duplicate room numbers are refused, photos are stored
- **Electricity:** meter readings, the sharing methods (equal, prorated, custom, individual meter) adding up exactly, validation and corrections
- **Billing and payments end to end:** create and send bills, tenant submits a payment (balance unchanged while waiting), owner verifies, receipt number and PDF, rejection with a reason, oldest bills paid first, overdue marking and de-duplicated reminders, overpayment refused
- **Reports and announcements:** every report type as JSON, Excel and PDF; announcements to selected tenants
- **Units:** peso rounding, exact splitting, days stayed in a month, due-date clamping

## Security rules: `npm run test:rules` (project root)

Runs `firebase/tests/rules.test.js` with `@firebase/rules-unit-testing` on the Firestore and Storage emulators. 12 tests:
a tenant can read their own sent bills but not another tenant's bills or any drafts; can't change amounts, room capacity or payment status;
can only submit their own waiting payment claim; sees only their own notifications (and may only mark them read) and announcements addressed to them;
can't read Activity History or internal collections or give themselves a role; signed-out users see nothing; the owner can manage records;
payment proofs are private to the tenant and the owner; tenants can't upload room images or receipts.

## Admin web: `cd admin-web && npm run lint && npm run build`

Also verified in a real browser (Chrome via Playwright) against the emulators and seeded backend at 1366px and 390px widths:
every page loads with no console or API errors and no horizontal scrolling. Flows exercised through the UI: confirm a waiting payment
(success screen), reject one with a reason, the session survives a reload, add a room with amenities, add a tenant into it,
send an announcement to selected tenants, and check that Activity History shows no technical text.

## Tenant app: `cd tenant-mobile && flutter analyze && flutter test`

- `test/unit_test.dart`: peso formatting, payment-method labels, password policy, bill and payment parsing (new field names and statuses)
- `test/widget_test.dart`: login validation (and no self-registration), status badges always show text and not just colour, the confirmation dialog
- `test/api_contract_test.dart`: runs only against the live backend on the emulators (signs in through the Auth emulator):
  ```bash
  flutter test test/api_contract_test.dart --dart-define=BH_API=http://localhost:5000/api/v1
  ```
  It checks that every tenant endpoint parses into the app models, owner routes return 403, another tenant's bill returns 404, and a rejected token is refreshed and the request retried.

The web build (`flutter build web`) was also run in Chrome against the emulators: sign in as a tenant, then Home, My Room (with amenities), Bills, Bill details, Payments and Profile.

## Manual test script (end to end)

1. Root: `npm run emulators`. Backend: `npm run seed:reset` then `npm start`. Admin web: `npm start`. Tenant app: `flutter run -d edge`.
2. **Owner:** Rooms → *Add Room* (capacity 2, tick some amenities). Tenants → *Add Tenant* into that room; note the temporary password.
3. **Tenant app:** sign in with the temporary password; you are asked to choose a new password.
4. **Owner:** Electricity → *Record Reading* for the room; open *How was this calculated?*. Bills → *Create Bills* for the month → review → *Send Bills*.
5. **Tenant app:** a notification appears (within a minute). My Bills shows the bill; open it and download the PDF.
6. **Tenant app:** Payments → *I Have Paid* (GCash, reference number, receipt photo) → "Payment submitted successfully." with status **Waiting for verification**; the bill is still unpaid.
7. **Owner:** the Payments badge and "What Needs Your Attention" update. Open the payment, view the proof, *Confirm Payment* → **✅ Payment Confirmed**.
8. **Tenant app:** "Payment confirmed" notification; the bill shows Partially paid or Paid; open the payment → *View or Share Receipt*.
9. **Owner:** Reports → export to PDF and Excel. Activity History lists each step in plain language.
10. Abuse checks: submit the same reference number twice (refused), pay more than owed (refused), assign a tenant to a full room (blocked), sign in to the admin website with a tenant account (refused).
