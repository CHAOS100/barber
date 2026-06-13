import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

const db = () => getFirestore();
const text = (value) => String(value || '').trim();

const requireAuth = (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.');
  return request.auth;
};

const requireCustomer = (request) => {
  const auth = requireAuth(request);
  if (auth.token.firebase?.sign_in_provider !== 'phone') {
    throw new HttpsError('permission-denied', 'Firebase Phone Authentication is required.');
  }
  return auth;
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

export const createCustomerReview = onCall(async (request) => {
  const auth = requireCustomer(request);
  const appointmentId = text(request.data?.appointmentId);
  const rating = normalizeRating(request.data?.rating);
  const reviewText = normalizeReviewText(request.data?.text);
  if (!appointmentId) throw new HttpsError('invalid-argument', 'appointmentId is required.');

  const reviewRef = db().collection('reviews').doc();
  await db().runTransaction(async (transaction) => {
    const appointmentRef = db().doc(`appointments/${appointmentId}`);
    const userRef = db().doc(`users/${auth.uid}`);
    const existingQuery = db().collection('reviews').where('appointmentId', '==', appointmentId).limit(1);
    const [appointmentSnapshot, userSnapshot, existingReviews] = await Promise.all([
      transaction.get(appointmentRef),
      transaction.get(userRef),
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
    if (!existingReviews.empty) {
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
  const customerName = text(request.data?.customerName);
  const rating = normalizeRating(request.data?.rating);
  const reviewText = normalizeReviewText(request.data?.text);
  if (!customerName) throw new HttpsError('invalid-argument', 'customerName is required.');

  const reviewRef = db().collection('reviews').doc();
  await reviewRef.set({
    customerId: text(request.data?.customerId) || 'manual',
    customerName,
    appointmentId: text(request.data?.appointmentId) || `manual-${reviewRef.id}`,
    serviceName: text(request.data?.serviceName),
    rating,
    text: reviewText,
    status: request.data?.status === 'hidden' ? 'hidden' : 'published',
    source: 'admin',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
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
