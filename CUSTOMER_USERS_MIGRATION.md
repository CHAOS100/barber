# Customer Users Migration And Duplicate Cleanup

Firestore collection `users` is the only customer identity source.

Each customer document must use the Firebase Authentication UID as its document ID:

```text
users/{firebaseAuthUid}
```

Required identity fields:

```text
uid: same value as the document ID
phoneNumber: the normalized Firebase Auth phone number, for example +9725XXXXXXXX
firstName
lastName
role: "customer"
createdAt
updatedAt
lastLoginAt
```

## Legacy Browser Data

The application no longer reads customer identity from `CustomerProfile`, mock customers,
or browser `localStorage`. Existing `CustomerProfile` and local mock appointment identity
records are removed from the local database when it is loaded.

## Duplicate Phone Number Audit

Production audit performed on June 13, 2026:

- `users` documents: 1
- duplicate `phoneNumber` groups: 0
- documents whose ID does not match their `uid`: 0

Before relying on the new model, audit the `users` collection in Firebase Console:

1. Export or back up the `users` and `appointments` collections.
2. Sort or query users by `phoneNumber`.
3. For every duplicated phone number, identify the canonical Firebase Authentication UID.
4. Keep only `users/{canonicalFirebaseAuthUid}`.
5. Merge the correct `firstName`, `lastName`, timestamps, preferences, warning count, and block status.
6. Update any historical `appointments.customerId` values that point to a duplicate UID.
7. Delete the duplicate user documents only after verifying appointment ownership.

Do not change `phoneNumber`, `role`, or `uid` to repair a duplicate. Create or keep the
document whose ID matches the Firebase Authentication UID and migrate references to it.

New registrations perform a server-side phone-number uniqueness check before creating
`users/{uid}`. Firestore rules also prevent customers from changing `phoneNumber`, `role`,
UID, or names after registration. Only an active admin can edit customer names later.
