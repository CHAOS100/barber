# Firebase Vercel Realtime Fix Report

Date: 2026-06-10

## What Was Broken

- Vercel builds require all Firebase web configuration values at build time,
  but the repository's local `.env` is ignored and is not available to Vercel.
- Admin access previously depended only on the existence of `admins/{uid}`.
  The live project had no admin document, so Firestore denied the admin
  realtime listener.
- Admin login accepted any valid Firebase email/password user before Firestore
  later rejected appointment access.
- The realtime query could be constructed before Firebase configuration and
  authentication succeeded, obscuring configuration failures.
- Debug logs did not distinguish a write attempt, write failure, listener
  subscription, or explicit admin permission denial.

Firebase Hosting is not part of this deployment architecture.

## What Was Fixed

- All six `VITE_FIREBASE_*` values are now required. Missing values are
  reported by name with Vercel redeployment guidance.
- Admin authorization now requires:

```text
admins/{firebaseAuthUid}
role: "admin"
active: true
```

- Admin login reads and validates its own admin document before creating the
  local admin session. Invalid admins are signed out.
- Appointment listeners build their Firestore queries only after Firebase
  authentication and authorization succeed.
- Browser-console diagnostics now cover customer write attempts/results,
  admin subscription and permission denial, snapshots, and admin status
  updates.
- A secure local provisioning script and Firestore emulator rule tests were
  added.

## Required Collections

### `appointments`

Required customer-created appointment fields:

```text
customerId, customerName, customerPhone, serviceName, serviceId,
barberId, date, startTime, endTime, status, createdAt
```

New customer appointments use `status: "pending"`. Admin approval changes the
status to `confirmed`; rejection changes it to `cancelled`.

### `admins`

Required authorization fields:

```text
role: "admin"
active: true
name
email
createdAt
```

The `customers` collection is not used by the current realtime appointment
flow.

## Manual Configuration Required

1. Follow `VERCEL_ENV_SETUP.md` to add these variables to Vercel Production
   and Preview, then redeploy:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

2. Create the Firebase Authentication admin user and follow
   `ADMIN_FIRESTORE_SETUP.md` to create `admins/{uid}`.
3. Redeploy the Vercel production application after setting environment
   variables.

The hardened Firestore rules were deployed to `ost-barber-app` on
2026-06-10. Deploy the rules again after any future rules change:

```bash
firebase deploy --only firestore:rules --project ost-barber-app
```

## Live Sync Test

Use separate customer and admin browser sessions:

1. Sign in as the provisioned admin and keep the admin dashboard open.
2. In the customer session, create an appointment.
3. Confirm the customer console logs the write attempt and successful creation.
4. Confirm the document appears in Firestore `appointments` with `pending`
   status.
5. Confirm the admin console logs a snapshot and the appointment appears
   without refreshing.
6. Approve the appointment and confirm the customer sees `confirmed` live.
7. Repeat with another appointment, reject it, and confirm the customer sees
   `cancelled` live.

An admin permission problem logs:

```text
[Firestore] Admin appointments listener permission denied
```

## Automated Verification

The Firestore emulator tests cover:

- Active admin access.
- Inactive and invalid-role admin denial.
- Customer creation and reading of their own appointment.
- Cross-customer read denial.
- Admin approval and rejection updates.

Implementation verification completed successfully:

```text
npm run test:firestore-rules  PASS
npm run build                 PASS
npm run lint                  PASS
npm run typecheck             PASS
Firestore rules deployment    PASS
```

Run:

```bash
npm run test:firestore-rules
npm run build
npm run lint
npm run typecheck
```

Production Vercel environment configuration and the final two-browser live test
require manual access to the Vercel and Firebase admin accounts.

## Mobile Compatibility And Remaining Risk

Future iOS and Android applications should register native apps under the same
Firebase project, `ost-barber-app`, and use their native Firebase configuration
files. They can share the same Firestore collections, rules, and appointment
status model with the Vercel web app.

Customer authentication uses Firebase Phone Authentication, so appointment history
can follow the same verified phone user across devices.

Slot availability still reads local/mock appointment data. Preventing
cross-device double booking requires a separate Firestore-backed availability
and transaction design; that work is outside this realtime status-sync fix.
