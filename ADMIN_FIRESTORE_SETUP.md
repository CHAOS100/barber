# Admin Firestore Setup

An admin needs both:

1. A Firebase Authentication email/password user.
2. An active Firestore document at `admins/{firebaseAuthUid}`.

The application and Firestore rules reject users whose admin document is
missing, inactive, or has the wrong role.

## Required Document

Collection: `admins`

Document ID: the exact Firebase Authentication UID

```text
role: "admin"          string
active: true           boolean
name: "Admin Name"     string
email: "admin@..."     string
createdAt: <timestamp> timestamp
updatedAt: <timestamp> timestamp (created by the provisioning script)
```

Granular `permissions` are not currently used. An active `admin` role can
manage all appointments.

## Recommended: Provisioning Script

The script requires an existing Firebase Authentication user. It does not
create or change passwords.

1. In Firebase Console -> Authentication -> Users, create the email/password
   admin user if it does not exist.
2. In Firebase Console -> Project settings -> Service accounts, generate a
   private key for `ost-barber-app`.
3. Store that JSON file outside the repository.
4. In PowerShell, set the local credential path and run:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\secure\ost-barber-app-service-account.json"
npm run admin:provision -- --email admin@example.com --name "Admin Name"
```

The script:

- Refuses credentials for any project other than `ost-barber-app`.
- Resolves the existing Auth user by email.
- Creates or updates `admins/{uid}` with `role: admin` and `active: true`.
- Preserves the original `createdAt` when updating an existing admin.

Never commit the service-account JSON and never add it to Vercel.

## Manual Firebase Console Setup

1. Open Firebase Console -> Authentication -> Users.
2. Copy the intended admin user's UID.
3. Open Firestore Database.
4. Create collection `admins` if it does not exist.
5. Create a document whose document ID is the copied UID.
6. Add the required fields and types shown above. Use the Firestore timestamp
   type for `createdAt`.

## Disable An Admin

Set `active` to `false` in `admins/{uid}`. Firestore rules will immediately
deny appointment reads and writes for that user. The Auth user may also be
disabled separately in Firebase Authentication.

