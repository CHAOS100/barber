import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

const db = () => getFirestore();

const syncAppointmentStatsForCustomer = async (customerId) => {
  if (!customerId) return;
  const snapshot = await db().collection('appointments').where('customerId', '==', customerId).get();
  const appointments = snapshot.docs.map((item) => item.data());
  const completed = appointments.filter((item) => item.status === 'completed');

  await db().doc(`users/${customerId}`).set({
    visitsCount: completed.length,
    completedAppointments: completed.length,
    cancelledAppointments: appointments.filter((item) =>
      item.status === 'cancelled' || item.status === 'rejected').length,
    noShowCount: appointments.filter((item) => item.status === 'no_show').length,
    totalSpent: appointments
      .filter((item) => item.paid === true)
      .reduce((total, item) => total + Number(item.servicePrice || 0), 0),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
};

const syncReviewStatsForCustomer = async (customerId) => {
  if (!customerId || customerId === 'manual') return;
  const snapshot = await db().collection('reviews').where('customerId', '==', customerId).get();
  await db().doc(`users/${customerId}`).set({
    reviewsCount: snapshot.size,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
};

export const syncCustomerAppointmentStats = onDocumentWritten(
  'appointments/{appointmentId}',
  async (event) => {
    const customerIds = new Set([
      event.data.before.exists ? event.data.before.data().customerId : null,
      event.data.after.exists ? event.data.after.data().customerId : null,
    ]);
    await Promise.all([...customerIds].filter(Boolean).map(syncAppointmentStatsForCustomer));
  },
);

export const syncCustomerReviewStats = onDocumentWritten(
  'reviews/{reviewId}',
  async (event) => {
    const customerIds = new Set([
      event.data.before.exists ? event.data.before.data().customerId : null,
      event.data.after.exists ? event.data.after.data().customerId : null,
    ]);
    await Promise.all([...customerIds].filter(Boolean).map(syncReviewStatsForCustomer));
  },
);

export const syncCustomerActiveAppointmentLock = onDocumentWritten(
  'appointments/{appointmentId}',
  async (event) => {
    const customerIds = new Set([
      event.data.before.exists ? event.data.before.data().customerId : null,
      event.data.after.exists ? event.data.after.data().customerId : null,
    ]);

    await Promise.all([...customerIds].filter(Boolean).map(async (customerId) => {
      const lockRef = db().doc(`customerBookingLocks/${customerId}`);
      const snapshot = await db().collection('appointments').where('customerId', '==', customerId).get();
      const active = snapshot.docs.find((item) =>
        ['pending', 'approved', 'confirmed', 'scheduled'].includes(item.data().status));
      if (!active) {
        await lockRef.delete();
        return;
      }
      await lockRef.set({
        customerId,
        appointmentId: active.id,
        status: active.data().status,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }));
  },
);
