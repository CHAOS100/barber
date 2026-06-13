import {
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  ensureFirebaseAdmin,
  ensureFirebaseCustomer,
  getFirebaseFunctions,
  getFirestoreDb,
} from '@/lib/firebase';

const mapProfile = (snapshot) => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    name: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
    phone: data.phoneNumber || '',
    is_blocked: data.blocked === true || data.isBlocked === true,
    blocked_reason: data.blockedReason || '',
    blocked_by: data.blockedBy || null,
    warning_count: Number(data.warningCount || 0),
    total_appointments: Number(data.visitsCount || 0),
  };
};

export const customerProfileToSession = (profile) => ({
  uid: profile.uid,
  phone: profile.phoneNumber,
  phoneNumber: profile.phoneNumber,
  firstName: profile.firstName,
  lastName: profile.lastName,
  name: `${profile.firstName} ${profile.lastName}`.trim(),
  role: profile.role || 'customer',
  notificationPreferences: profile.notificationPreferences || {},
  language: profile.language || 'he',
  blocked: profile.blocked === true || profile.isBlocked === true,
  blockedReason: profile.blockedReason || '',
  warningCount: Number(profile.warningCount || 0),
  visitsCount: Number(profile.visitsCount || 0),
  completedAppointments: Number(profile.completedAppointments || 0),
  cancelledAppointments: Number(profile.cancelledAppointments || 0),
  noShowCount: Number(profile.noShowCount || 0),
  totalSpent: Number(profile.totalSpent || 0),
  reviewsCount: Number(profile.reviewsCount || 0),
  is_blocked: profile.blocked === true || profile.isBlocked === true,
  blocked_reason: profile.blockedReason || '',
  warning_count: Number(profile.warningCount || 0),
  total_appointments: Number(profile.visitsCount || 0),
  isAdmin: false,
  authProvider: 'phone',
});

export const findAuthenticatedUserProfile = async () => {
  const firebaseUser = await ensureFirebaseCustomer();
  const phoneNumber = firebaseUser.phoneNumber;
  const snapshot = await getDoc(doc(getFirestoreDb(), 'users', firebaseUser.uid));

  console.info('[Customer Auth] user profile read complete', {
    uid: firebaseUser.uid,
    exists: snapshot.exists(),
  });

  if (!snapshot.exists()) {
    console.info('[Customer Auth] new user registration required', { uid: firebaseUser.uid });
    return null;
  }

  const profile = mapProfile(snapshot);
  if (
    profile.id !== firebaseUser.uid
    || profile.uid !== firebaseUser.uid
    || profile.phoneNumber !== phoneNumber
    || profile.role !== 'customer'
  ) {
    throw Object.assign(new Error('Customer profile UID does not match Firebase Auth UID.'), {
      code: 'customer/profile-uid-mismatch',
    });
  }

  console.info('[Customer Auth] user exists', { uid: firebaseUser.uid });
  return profile;
};

export const completeExistingCustomerLogin = async () => {
  await ensureFirebaseCustomer();
  const callable = httpsCallable(getFirebaseFunctions(), 'completeCustomerLogin');
  const result = await callable();
  const data = /** @type {{ registrationRequired: boolean, profile: any }} */ (result.data);
  if (data.registrationRequired || !data.profile) {
    return null;
  }
  console.info('[Customer Auth] login complete', { uid: data.profile.uid });
  return data.profile;
};

export const getCurrentCustomerProfile = async () => {
  const firebaseUser = await ensureFirebaseCustomer();
  const snapshot = await getDoc(doc(getFirestoreDb(), 'users', firebaseUser.uid));
  if (!snapshot.exists()) return null;

  const profile = mapProfile(snapshot);
  if (
    profile.uid !== firebaseUser.uid
    || profile.phoneNumber !== firebaseUser.phoneNumber
    || profile.role !== 'customer'
  ) {
    throw Object.assign(new Error('Customer profile does not match Firebase Authentication.'), {
      code: 'customer/profile-mismatch',
    });
  }
  return profile;
};

export const updateOwnCustomerPreferences = async (
  /** @type {{ notificationPreferences?: any, language?: string }} */ input,
) => {
  const { notificationPreferences, language } = input;
  const firebaseUser = await ensureFirebaseCustomer();
  const payload = /** @type {Record<string, any>} */ ({ updatedAt: serverTimestamp() });
  if (notificationPreferences !== undefined) payload.notificationPreferences = notificationPreferences;
  if (language !== undefined) payload.language = language;
  await updateDoc(doc(getFirestoreDb(), 'users', firebaseUser.uid), payload);
};

export const subscribeToCurrentCustomerProfile = (onData, onError) => {
  let unsubscribe = () => {};
  let cancelled = false;

  ensureFirebaseCustomer()
    .then((firebaseUser) => {
      if (cancelled) return;
      unsubscribe = onSnapshot(doc(getFirestoreDb(), 'users', firebaseUser.uid), (snapshot) => {
        if (!snapshot.exists()) {
          onData(null);
          return;
        }
        const profile = mapProfile(snapshot);
        if (
          profile.uid !== firebaseUser.uid
          || profile.phoneNumber !== firebaseUser.phoneNumber
          || profile.role !== 'customer'
        ) {
          onError(Object.assign(new Error('Customer profile does not match Firebase Authentication.'), {
            code: 'customer/profile-mismatch',
          }));
          return;
        }
        onData(profile);
      }, onError);
    })
    .catch(onError);

  return () => {
    cancelled = true;
    unsubscribe();
  };
};

export const subscribeToAllCustomerProfiles = (onData, onError) => {
  let unsubscribe = () => {};
  let cancelled = false;

  ensureFirebaseAdmin()
    .then(() => {
      if (cancelled) return;
      unsubscribe = onSnapshot(collection(getFirestoreDb(), 'users'), (snapshot) => {
        onData(snapshot.docs.map(mapProfile).sort((a, b) => a.name.localeCompare(b.name, 'he')));
      }, onError);
    })
    .catch(onError);

  return () => {
    cancelled = true;
    unsubscribe();
  };
};

export const updateCustomerByAdmin = async (userId, changes) => {
  const admin = await ensureFirebaseAdmin();
  const payload = /** @type {Record<string, any>} */ ({ updatedAt: serverTimestamp() });
  if (changes.firstName !== undefined) payload.firstName = String(changes.firstName || '').trim();
  if (changes.lastName !== undefined) payload.lastName = String(changes.lastName || '').trim();
  if (changes.blocked !== undefined) {
    const blockedReason = String(changes.blockedReason || '').trim();
    if (changes.blocked === true && !blockedReason) {
      throw Object.assign(new Error('יש להזין סיבת חסימה.'), {
        code: 'customer/blocked-reason-required',
      });
    }
    payload.blocked = changes.blocked === true;
    payload.blockedReason = changes.blocked === true
      ? blockedReason
      : '';
    payload.blockedAt = changes.blocked === true ? serverTimestamp() : null;
    payload.blockedBy = changes.blocked === true ? admin.uid : null;
    payload.isBlocked = deleteField();
  }
  if (changes.warningCount !== undefined) payload.warningCount = Math.max(0, Number(changes.warningCount || 0));
  await updateDoc(doc(getFirestoreDb(), 'users', userId), payload);
};

export const createCustomerProfile = async ({ firstName, lastName }) => {
  await ensureFirebaseCustomer();
  const callable = httpsCallable(getFirebaseFunctions(), 'registerCustomerProfile');
  const result = await callable({ firstName, lastName });
  const data = /** @type {{ profile: any }} */ (result.data);
  console.info('[Customer Auth] user created', { uid: data.profile.uid });
  console.info('[Customer Auth] login complete', { uid: data.profile.uid });
  return data.profile;
};
