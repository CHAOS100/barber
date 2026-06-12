# Production Phone Auth And WhatsApp Jobs

## Firebase Phone Authentication

The customer login uses Firebase Web Phone Authentication with invisible reCAPTCHA.
Admin email/password login is unchanged.

Before deploying:

1. Open Firebase Console for `ost-barber-app`.
2. Go to **Authentication > Sign-in method**.
3. Enable **Phone**.
4. Go to **Authentication > Settings > Authorized domains**.
5. Add the production Vercel domain and any custom production domain.
6. Keep all six existing `VITE_FIREBASE_*` variables configured in Vercel.

Israeli mobile numbers are normalized as follows:

- `05XXXXXXXX` becomes `+9725XXXXXXXX`
- `9725XXXXXXXX` becomes `+9725XXXXXXXX`
- `+9725XXXXXXXX` remains unchanged

Production never generates or displays an OTP. A local-only development flow can be
enabled explicitly with:

```bash
VITE_ENABLE_DEV_DEMO_OTP=true
```

Do not configure `VITE_ENABLE_DEV_DEMO_OTP` in Vercel. The flag also requires Vite
development mode, so it cannot activate in a production build. Production Firestore
rules require the `phone` sign-in provider; the local demo flag does not bypass
production security rules.

## Notification Jobs

Cloud Functions create jobs in `notificationJobs`:

| Trigger | Job types |
| --- | --- |
| Appointment created | `appointment_created_admin` |
| Appointment confirmed | `appointment_approved`, `appointment_reminder_24h`, `appointment_reminder_2h` |
| Appointment cancelled/rejected | `appointment_cancelled` |

Every job contains:

```text
type
channel: "whatsapp"
phone
appointmentId
scheduledFor
status: "pending"
createdAt
sentAt
error
```

Job document IDs are deterministic, so Firestore trigger retries do not duplicate
notifications.

## Admin WhatsApp Phone

The admin phone is a Cloud Functions parameter named `ADMIN_WHATSAPP_PHONE`. It is
not hardcoded in React components.

Deploy the functions:

```bash
npm install --prefix functions
firebase deploy --only functions --project ost-barber-app
```

During the first deployment, Firebase CLI asks for `ADMIN_WHATSAPP_PHONE`. Enter an
Israeli mobile number such as `+9725XXXXXXXX`. Cloud Functions deployment may require
the Firebase project to use the Blaze billing plan.

## WhatsApp Provider

The backend contains a provider contract and a disabled provider placeholder for:

- WhatsApp Cloud API
- Twilio WhatsApp
- Green API
- WATI
- 360dialog

No WhatsApp message is sent yet. A trusted Cloud Function or external server must:

1. Query pending jobs where `scheduledFor` is due.
2. Send through the configured WhatsApp provider.
3. Set `status` to `sent` and populate `sentAt`, or set `status` to `failed` and
   populate `error`.

Firestore rules deny all client writes to `notificationJobs`. The Admin SDK used by
Cloud Functions bypasses those client rules.
