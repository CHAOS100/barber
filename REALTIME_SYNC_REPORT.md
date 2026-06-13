# Realtime Appointment Synchronization Report

Date: 2026-06-09

## Audit Result

This repository is a React/Vite web application, not a Flutter application.
Before this fix it had no Firebase SDK, Firebase configuration, Firestore
rules, or Firestore appointment writes. Appointments were stored in local
browser storage, and the admin appointments page still fell back to mock data.

## Firebase Project

Both customer and admin now use the same Firebase singleton and project:

- Project ID: `ost-barber-app`
- Web app ID: `1:861100216939:web:d52c7f14e1fb987490972e`
- Firestore database: `(default)`
- Firestore location: `nam5`
- Realtime updates: enabled

The shared project is configured by `.env`, `.env.example`, `.firebaserc`, and
`src/lib/firebase.js`.

During verification, the Firebase CLI enabled the Firestore API, created the
default Firestore database, and deployed `firestore.rules`. Anonymous and
email/password Firebase Authentication providers were also enabled.

## Implementation

- Customer bookings write directly to the Firestore `appointments` collection.
- Customer and admin appointment lists use Firestore `onSnapshot()` listeners.
- The admin appointments screen no longer imports or falls back to
  `MOCK_APPOINTMENTS`.
- The admin dashboard shows a realtime pending count and a visible realtime
  list of pending appointments.
- New appointments always receive `status: "pending"`.
- Appointment creation and admin snapshot callbacks emit debug logs.
- A race between concurrent anonymous-auth calls was fixed so writes and
  listeners always use the same customer UID.

Every new appointment contains:

```text
customerId, customerName, customerPhone, serviceName, serviceId,
barberId, date, startTime, endTime, status, createdAt
```

Optional UI fields such as `servicePrice`, `serviceDuration`, `barberName`, and
`notes` are also stored.

## Security Rules

The deployed `firestore.rules` enforce:

- Customers must be authenticated.
- Customers can create appointments only for their own Firebase UID.
- Customer-created appointments must have `pending` status and a server
  timestamp.
- Customers can read only their own appointments.
- Customers can only reschedule or cancel their own appointments.
- Admins can read, create, update, and delete all appointments.
- Admin access requires an active admin document at `admins/{firebaseAuthUid}`
  with `role: "admin"` and `active: true`.
- All unrelated Firestore documents are denied by default.

## Admin Provisioning

No permanent admin account was created during testing. To authorize a real
admin:

1. Create an email/password user in Firebase Authentication.
2. Follow `ADMIN_FIRESTORE_SETUP.md` to create `admins/{that-user-uid}` with
   the required role, active flag, profile fields, and timestamp.
3. Sign in through the app's admin login.

The previous browser-only admin flag is not trusted by Firestore rules.

## Verification

Cloud verification completed successfully:

- Customer created a real Firestore appointment.
- Customer realtime listener received its own appointment.
- Stored document contained all required fields, `status: pending`, and a
  server-generated `createdAt`.
- A temporary authorized admin listener received a new customer appointment
  in realtime.
- The admin dashboard displayed a new pending appointment without refresh in
  approximately 3.4 seconds.
- Debug logs confirmed appointment creation and admin snapshots.
- All temporary appointments, admin documents, and test auth users were
  removed after verification.

Commands:

```text
npm run build       PASS
npm run lint        PASS
npm run typecheck   PASS
flutter analyze     PASS
flutter test        NOT APPLICABLE: command ran, but no Flutter test directory exists
firebase deploy --only firestore:rules --project ost-barber-app   PASS
```

## Remaining Architecture Notes

- Customer identity uses Firebase Phone Authentication for cross-device customer
  history. The app never generates or displays verification codes.
- Slot availability still reads the old local appointment cache. Preventing
  cross-device double booking securely requires a server transaction or a
  separate availability model that does not expose other customers' data.

## Main Files

- `src/lib/firebase.js`
- `src/lib/appointmentsFirestore.js`
- `src/hooks/useAppointmentsRealtime.js`
- `src/pages/Booking.jsx`
- `src/pages/Appointments.jsx`
- `src/pages/admin/AdminAppointments.jsx`
- `src/pages/admin/AdminDashboard.jsx`
- `firestore.rules`
- `firebase.json`

## References

- https://firebase.google.com/docs/firestore/query-data/listen
- https://firebase.google.com/docs/firestore/security/rules-conditions
- https://firebase.google.com/docs/auth/web/anonymous-auth
