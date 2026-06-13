import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  ensureFirebaseAdmin,
  ensureFirebaseCustomer,
  getFirebaseFunctions,
  getFirestoreDb,
} from '@/lib/firebase';

const reviewsCollection = () => collection(getFirestoreDb(), 'reviews');

const mapReview = (snapshot) => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    customer_name: data.customerName || '',
    service_name: data.serviceName || '',
    comment: data.text || '',
    is_hidden: data.status === 'hidden',
    created_date: data.createdAt?.toDate?.().toISOString?.() || null,
  };
};

const sortReviews = (reviews) => reviews.sort((left, right) =>
  String(right.created_date || '').localeCompare(String(left.created_date || '')));

const subscribe = (reference, onData, onError) => onSnapshot(
  reference,
  (snapshot) => onData(sortReviews(snapshot.docs.map(mapReview))),
  onError,
);

const authenticatedSubscribe = (authenticate, referenceFactory, onData, onError) => {
  let unsubscribe = () => {};
  let cancelled = false;
  authenticate()
    .then((user) => {
      if (!cancelled) unsubscribe = subscribe(referenceFactory(user), onData, onError);
    })
    .catch(onError);
  return () => {
    cancelled = true;
    unsubscribe();
  };
};

const callReviewFunction = async (name, input) => {
  const callable = httpsCallable(getFirebaseFunctions(), name);
  const result = await callable(input);
  return result.data;
};

export const subscribeToPublishedReviews = (onData, onError) =>
  subscribe(query(reviewsCollection(), where('status', '==', 'published')), onData, onError);

export const subscribeToCustomerReviews = (onData, onError) =>
  authenticatedSubscribe(
    ensureFirebaseCustomer,
    (user) => query(reviewsCollection(), where('customerId', '==', user.uid)),
    onData,
    onError,
  );

export const subscribeToAdminReviews = (onData, onError) =>
  authenticatedSubscribe(ensureFirebaseAdmin, reviewsCollection, onData, onError);

export const createCustomerReview = async (input) => {
  await ensureFirebaseCustomer();
  return callReviewFunction('createCustomerReview', input);
};

export const createAdminReview = async (input) => {
  await ensureFirebaseAdmin();
  return callReviewFunction('createAdminReview', input);
};

export const setAdminReviewStatus = async (reviewId, status) => {
  await ensureFirebaseAdmin();
  return callReviewFunction('setAdminReviewStatus', { reviewId, status });
};

export const deleteAdminReview = async (reviewId) => {
  await ensureFirebaseAdmin();
  return callReviewFunction('deleteAdminReview', { reviewId });
};
