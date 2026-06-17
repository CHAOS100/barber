# Production Phone Auth And WhatsApp Jobs

## Firebase Phone Authentication

The customer login uses Firebase Web Phone Authentication with invisible reCAPTCHA.
Admin email/password login is unchanged.

The web app keeps one hidden button anchor for `RecaptchaVerifier` and configures it
with `size: "invisible"`. Normal login does not show a checkbox. Google may still
show an interactive image challenge when it classifies a request as suspicious;
that security decision cannot and should not be bypassed.

Before deploying:

1. Open Firebase Console for `ost-barber-app`.
2. Go to **Authentication > Sign-in method**.
3. Enable **Phone**.
4. Go to **Authentication > Settings > SMS region policy** and allow **Israel (IL)**.
5. Go to **Authentication > Settings > Authorized domains**.
6. Add `barber-sigma-five.vercel.app` and any custom production domain.
7. Keep all six existing `VITE_FIREBASE_*` variables configured in Vercel.

Firebase creates and manages the reCAPTCHA client configuration automatically. Do not
create or expose a separate reCAPTCHA site key in the frontend.

Israeli mobile numbers are normalized as follows:

- `05XXXXXXXX` becomes `+9725XXXXXXXX`
- `9725XXXXXXXX` becomes `+9725XXXXXXXX`
- `+9725XXXXXXXX` remains unchanged

The application never generates or displays an OTP. Development and production both
use Firebase Phone Authentication. Use Firebase Console fictional phone numbers when
testing without sending a real SMS.

Firebase Authentication test phone numbers never send a real SMS. To verify real delivery,
use a phone number that is not configured under **Authentication > Sign-in method > Phone >
Phone numbers for testing**.

## Capacitor Android Phone Authentication

The web/Vercel app keeps using Firebase Web Phone Auth with invisible reCAPTCHA.
The Capacitor Android app must not use the web `RecaptchaVerifier` inside the WebView.
Android builds use `@capacitor-firebase/authentication` and native Firebase Phone Auth.

Installed package:

```bash
npm install @capacitor-firebase/authentication firebase
```

Capacitor is configured with:

```text
appId: com.ostbarber.app
FirebaseAuthentication.providers: ["phone"]
FirebaseAuthentication.skipNativeAuth: false
```

Android Firebase setup checklist:

1. Firebase Console project: `ost-barber-app`.
2. Android app package name: `com.ostbarber.app`.
3. Keep `google-services.json` at `android/app/google-services.json`.
4. Add SHA-1 and SHA-256 fingerprints for the debug/release signing keys.
5. Enable **Authentication > Sign-in method > Phone**.
6. Allow Israel in **Authentication > Settings > SMS region policy**.
7. After dependency/config changes, run:

```bash
npm run build
npx cap sync android
```

Native Android sign-in authenticates the native Firebase SDK first. The app then calls
the Cloud Function `createWebCustomTokenFromNativeAuth`, which verifies the native ID
token and returns a Firebase custom token for the same UID. This bridges the native
session into the Firebase JavaScript SDK so existing Firestore and Callable Functions
continue to use `firebaseAuth.currentUser`.

If admin phone login creates a different Firebase UID than the email/password admin
account, create a matching `admins/{uid}` document manually for the phone-auth UID.

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
