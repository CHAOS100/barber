# Production Data Cleanup

Production UI now reads appointments, customer profiles, services, reviews, gallery items, and dashboard statistics from Firestore only. Empty collections intentionally render zero values or empty states.

## Existing customer documents

Existing `users/{uid}` documents should contain:

```text
visitsCount: 0
completedAppointments: 0
cancelledAppointments: 0
noShowCount: 0
totalSpent: 0
reviewsCount: 0
blocked: false
blockedReason: ""
blockedAt: null
```

Appointment and review write triggers recalculate the count fields from real Firestore records. Do not copy values from localStorage or legacy demo profiles.

Legacy `isBlocked: true` values remain enforced during migration. The next admin block/unblock action writes the new `blocked` fields and removes `isBlocked`.

## Duplicate phone numbers

Before production rollout, query `users` by `phoneNumber` and keep exactly one document whose ID and `uid` both match the Firebase Auth UID. Merge legitimate history into that document, then remove duplicate documents with the Firebase Console or an audited Admin SDK migration.

## Booking enforcement

Browser clients cannot write appointments directly. `createCustomerAppointment` checks the saved user profile, rejects blocked customers, checks existing active appointments, and writes a private `customerBookingLocks/{uid}` document in the same transaction to prevent concurrent duplicate active bookings.
