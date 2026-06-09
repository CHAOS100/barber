# Vercel Firebase Environment Setup

The web application is deployed on Vercel. It does not require Firebase
Hosting.

## Required Variables

Add all six variables to the Vercel project:

| Variable | Value |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | Copy the API key from the Firebase web app configuration |
| `VITE_FIREBASE_AUTH_DOMAIN` | `ost-barber-app.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `ost-barber-app` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `ost-barber-app.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `861100216939` |
| `VITE_FIREBASE_APP_ID` | `1:861100216939:web:d52c7f14e1fb987490972e` |

To find the API key:

1. Open Firebase Console and select `ost-barber-app`.
2. Open **Project settings**.
3. Under **Your apps**, select the web app.
4. Copy `apiKey` from the Firebase SDK configuration.

`VITE_*` values are visible in the browser bundle by design. Never put a
Firebase Admin service-account key or another server secret in a `VITE_*`
variable.

## Configure Vercel

1. Open the Vercel dashboard and select the deployed OST Barber project.
2. Open **Settings** -> **Environment Variables**.
3. Add each variable from the table.
4. Enable each variable for **Production** and **Preview**.
5. Save the variables.
6. Open **Deployments** and redeploy the latest production deployment.

Vite embeds environment values during `npm run build`. Changing a Vercel
environment variable does not update an existing deployment; redeployment is
required.

## Verify

After redeployment:

1. Open the production site and browser developer console.
2. Create a customer appointment.
3. Confirm the console shows:
   - `[Firestore] Customer appointment write attempt`
   - `[Firestore] Customer appointment created`
4. Confirm Firebase Console -> Firestore Database -> `appointments` contains
   the new document.

If a variable is missing, the application reports the missing variable names
and instructs you to configure the Vercel build-time environment and redeploy.

