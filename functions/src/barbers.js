import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireActiveAdmin } from './auth.js';

const ALLOWED_ACTIONS = new Set(['activate', 'archive', 'restore']);

const isBookable = (barber) => (
  barber != null
  && barber.archived !== true
  && barber.active !== false
  && barber.is_active !== false
);

export const setBarberLifecycle = onCall(
  { enforceAppCheck: false },
  async (request) => {
    const auth = await requireActiveAdmin(request);
    const barberId = String(request.data?.barberId || '').trim();
    const action = String(request.data?.action || '').trim();

    if (!barberId) {
      throw new HttpsError('invalid-argument', 'barberId is required.', {
        code: 'barber/id-required',
      });
    }
    if (!ALLOWED_ACTIONS.has(action)) {
      throw new HttpsError('invalid-argument', 'Invalid barber lifecycle action.', {
        code: 'barber/invalid-lifecycle-action',
      });
    }

    const firestore = getFirestore();
    const barberRef = firestore.doc(`barbers/${barberId}`);

    await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(barberRef);
      if (!snapshot.exists) {
        throw new HttpsError('not-found', 'Barber not found.', {
          code: 'barber/not-found',
        });
      }

      const barber = snapshot.data() || {};
      if (action === 'archive' && isBookable(barber)) {
        throw new HttpsError('failed-precondition', 'Deactivate the barber before archiving.', {
          code: 'barber/deactivate-first',
        });
      }
      if (action === 'activate' && barber.archived === true) {
        throw new HttpsError('failed-precondition', 'Restore the barber before activation.', {
          code: 'barber/restore-first',
        });
      }

      const lifecycle = action === 'activate'
        ? { active: true, is_active: true, archived: false }
        : action === 'archive'
          ? { active: false, is_active: false, archived: true }
          : { active: false, is_active: false, archived: false };

      transaction.update(barberRef, {
        ...lifecycle,
        lifecycleUpdatedAt: FieldValue.serverTimestamp(),
        lifecycleUpdatedBy: auth.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return { barberId, action };
  },
);
