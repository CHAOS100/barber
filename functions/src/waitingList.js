import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { buildWaitingListManualJob } from './notifications/notificationJobs.js';
import { NotificationJobService } from './notifications/notificationService.js';

const db = () => getFirestore();
const notificationJobs = () => new NotificationJobService(getFirestore());

const text = (value) => String(value || '').trim();

const requireAuth = (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.');
  return request.auth;
};

const requireAdmin = async (request) => {
  const auth = requireAuth(request);
  const snapshot = await db().doc(`admins/${auth.uid}`).get();
  const admin = snapshot.data();
  if (!snapshot.exists || admin?.role !== 'admin' || admin?.active !== true) {
    throw new HttpsError('permission-denied', 'Active admin access is required.');
  }
  return auth;
};

export const manualNotifyWaitingListEntry = onCall(async (request) => {
  const auth = await requireAdmin(request);
  const waitingListId = text(request.data?.waitingListId);
  if (!waitingListId) {
    throw new HttpsError('invalid-argument', 'waitingListId is required.');
  }

  const reference = db().doc(`waitingList/${waitingListId}`);
  const snapshot = await reference.get();
  if (!snapshot.exists) {
    throw new HttpsError('not-found', 'Waiting list entry not found.');
  }

  const entry = { id: snapshot.id, ...snapshot.data() };
  if (!entry.phoneNumber) {
    throw new HttpsError('failed-precondition', 'Waiting list entry has no phone number.');
  }

  await notificationJobs().enqueue([
    buildWaitingListManualJob(waitingListId, entry),
  ]);
  await reference.update({
    status: 'notified',
    notifiedAt: FieldValue.serverTimestamp(),
    manuallyNotifiedAt: FieldValue.serverTimestamp(),
    manuallyNotifiedBy: auth.uid,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: waitingListId };
});
