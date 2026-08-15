import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireActiveAdmin, requirePhoneCustomerAuth } from './auth.js';

const db = () => getFirestore();
const text = (value) => String(value || '').trim();

const requireCustomer = (request) => requirePhoneCustomerAuth(request);
const requireAdmin = requireActiveAdmin;

const normalizeRating = (value) => {
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new HttpsError('invalid-argument', 'rating must be an integer from 1 to 5.');
  }
  return rating;
};

const normalizeReviewText = (value) => {
  const reviewText = text(value);
  if (!reviewText) throw new HttpsError('invalid-argument', 'Review text is required.');
  if (reviewText.length > 2000) throw new HttpsError('invalid-argument', 'Review text is too long.');
  return reviewText;
};

const normalizeAppointmentId = (value) => {
  const appointmentId = text(value);
  if (!appointmentId || appointmentId.includes('/')) {
    throw new HttpsError('invalid-argument', 'A valid appointmentId is required.');
  }
  return appointmentId;
};

export const createCustomerReview = onCall(async (request) => {
  const auth = await requireCustomer(request);
  const appointmentId = normalizeAppointmentId(request.data?.appointmentId);
  const rating = normalizeRating(request.data?.rating);
  const reviewText = normalizeReviewText(request.data?.text);

  const reviewRef = db().doc(`reviews/${appointmentId}`);
  await db().runTransaction(async (transaction) => {
    const appointmentRef = db().doc(`appointments/${appointmentId}`);
    const userRef = db().doc(`users/${auth.uid}`);
    const existingQuery = db().collection('reviews').where('appointmentId', '==', appointmentId).limit(1);
    const [appointmentSnapshot, userSnapshot, reviewSnapshot, existingReviews] = await Promise.all([
      transaction.get(appointmentRef),
      transaction.get(userRef),
      transaction.get(reviewRef),
      transaction.get(existingQuery),
    ]);

    const appointment = appointmentSnapshot.data();
    const user = userSnapshot.data();
    if (!appointmentSnapshot.exists || appointment?.customerId !== auth.uid) {
      throw new HttpsError('permission-denied', 'Customers may review only their own appointment.');
    }
    if (appointment.status !== 'completed') {
      throw new HttpsError('failed-precondition', 'A review requires a completed appointment.', {
        code: 'review/appointment-not-completed',
      });
    }
    if (reviewSnapshot.exists || !existingReviews.empty) {
      throw new HttpsError('already-exists', 'A review already exists for this appointment.', {
        code: 'review/already-exists',
      });
    }
    if (!userSnapshot.exists || user?.role !== 'customer') {
      throw new HttpsError('failed-precondition', 'A valid customer profile is required.');
    }

    transaction.set(reviewRef, {
      customerId: auth.uid,
      customerName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      appointmentId,
      serviceName: appointment.serviceName || '',
      rating,
      text: reviewText,
      status: 'published',
      source: 'customer',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { id: reviewRef.id };
});

export const createAdminReview = onCall(async (request) => {
  await requireAdmin(request);
  const appointmentId = normalizeAppointmentId(request.data?.appointmentId);
  const rating = normalizeRating(request.data?.rating);
  const reviewText = normalizeReviewText(request.data?.text);

  const reviewRef = db().doc(`reviews/${appointmentId}`);
  await db().runTransaction(async (transaction) => {
    const appointmentRef = db().doc(`appointments/${appointmentId}`);
    const existingQuery = db().collection('reviews').where('appointmentId', '==', appointmentId).limit(1);
    const [appointmentSnapshot, reviewSnapshot, existingReviews] = await Promise.all([
      transaction.get(appointmentRef),
      transaction.get(reviewRef),
      transaction.get(existingQuery),
    ]);
    const appointment = appointmentSnapshot.data();
    if (!appointmentSnapshot.exists || appointment?.status !== 'completed') {
      throw new HttpsError('failed-precondition', 'A review requires a completed appointment.', {
        code: 'review/appointment-not-completed',
      });
    }
    if (reviewSnapshot.exists || !existingReviews.empty) {
      throw new HttpsError('already-exists', 'A review already exists for this appointment.', {
        code: 'review/already-exists',
      });
    }
    transaction.set(reviewRef, {
      customerId: text(appointment.customerId),
      customerName: text(appointment.customerName),
      appointmentId,
      serviceName: text(appointment.serviceName),
      rating,
      text: reviewText,
      status: request.data?.status === 'hidden' ? 'hidden' : 'published',
      source: 'admin-assisted',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { id: reviewRef.id };
});

export const setAdminReviewStatus = onCall(async (request) => {
  await requireAdmin(request);
  const reviewId = text(request.data?.reviewId);
  const status = request.data?.status;
  if (!reviewId || !['published', 'hidden'].includes(status)) {
    throw new HttpsError('invalid-argument', 'reviewId and a valid status are required.');
  }
  await db().doc(`reviews/${reviewId}`).update({
    status,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { id: reviewId };
});

export const deleteAdminReview = onCall(async (request) => {
  await requireAdmin(request);
  const reviewId = text(request.data?.reviewId);
  if (!reviewId) throw new HttpsError('invalid-argument', 'reviewId is required.');
  await db().doc(`reviews/${reviewId}`).delete();
  return { id: reviewId };
});
