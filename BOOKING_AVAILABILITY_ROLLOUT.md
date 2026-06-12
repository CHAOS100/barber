# Booking Availability Rollout

The booking flow now uses Firestore services, barbers, settings, appointments, and sanitized realtime `appointmentBlocks`.
Appointment create, edit, move, cancel, and delete operations use trusted callable Cloud Functions so conflict checks cannot be bypassed by a browser client.

## Required production rollout

1. Point `GOOGLE_APPLICATION_CREDENTIALS` to a local service-account JSON file for `ost-barber-app`.
2. Seed the initial Firestore booking data and backfill availability blocks:

   ```bash
   npm run booking:seed
   ```

3. Deploy the callable functions, availability trigger, and Firestore rules:

   ```bash
   firebase deploy --only functions,firestore --project ost-barber-app
   ```

4. Redeploy the Vercel web app immediately after the Firebase deployment.

Do not put the service-account file in Git or Vercel.

## Firestore collections

- `appointments`: private appointment source of truth.
- `appointmentBlocks`: public sanitized realtime schedule blocks, maintained by Cloud Functions.
- `barbers`: staff records. Customer booking queries only active, non-archived barbers.
- `services`: service name, price, duration, and active state.
- `settings/booking`: contains `appointmentBufferMinutes`.

Use **Admin > ספרים / צוות** to manage staff, **Admin > שירותים** to manage services, and **Admin > הגדרות** to change the appointment buffer.
