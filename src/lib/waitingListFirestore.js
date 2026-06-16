import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  ensureFirebaseAdmin,
  ensureFirebaseCustomer,
  firebaseProjectId,
  getFirebaseFunctions,
  getFirestoreDb,
} from '@/lib/firebase';
import { getCurrentCustomerProfile } from '@/lib/customerProfilesFirestore';

const waitingListCollection = () => collection(getFirestoreDb(), 'waitingList');

export const WAITING_LIST_STATUSES = ['active', 'notified', 'booked', 'cancelled', 'expired'];
export const WAITING_LIST_PREFERENCE_TYPES = ['exact_time', 'time_range', 'day_part', 'whole_day'];

const byNewestFirst = (left, right) => {
  const leftTime = left.createdAt?.toMillis?.() || 0;
  const rightTime = right.createdAt?.toMillis?.() || 0;
  return rightTime - leftTime;
};

const mapWaitingListEntry = (snapshot) => ({
  id: snapshot.id,
  ...snapshot.data(),
});

const cleanOptionalFields = (payload) => {
  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined || payload[key] === '') delete payload[key];
  });
  return payload;
};

export const createWaitingListEntry = async (input) => {
  const firebaseUser = await ensureFirebaseCustomer();
  const profile = await getCurrentCustomerProfile();
  if (!profile) {
    throw Object.assign(new Error('Customer profile is missing.'), {
      code: 'customer/profile-missing',
    });
  }

  const preferenceType = input.preferenceType || 'whole_day';
  if (!WAITING_LIST_PREFERENCE_TYPES.includes(preferenceType)) {
    throw Object.assign(new Error('Invalid waiting list preference type.'), {
      code: 'waiting-list/invalid-preference',
    });
  }

  const payload = cleanOptionalFields({
    customerId: firebaseUser.uid,
    customerName: profile.name || `${profile.firstName || ''} ${profile.lastName || ''}`.trim(),
    phoneNumber: profile.phoneNumber || firebaseUser.phoneNumber,
    date: input.date,
    preferenceType,
    exactTime: preferenceType === 'exact_time' ? input.exactTime : undefined,
    startTime: preferenceType === 'time_range' ? input.startTime : undefined,
    endTime: preferenceType === 'time_range' ? input.endTime : undefined,
    dayPart: preferenceType === 'day_part' ? input.dayPart : undefined,
    serviceId: input.serviceId,
    serviceName: input.serviceName,
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    notifiedAt: null,
    expiresAt: input.expiresAt || null,
  });

  console.info('[Firestore] Waiting list create attempt', {
    projectId: firebaseProjectId,
    date: payload.date,
    preferenceType,
    serviceId: payload.serviceId || null,
  });

  const reference = await addDoc(waitingListCollection(), payload);
  console.info('[Firestore] Waiting list entry created', {
    projectId: firebaseProjectId,
    waitingListId: reference.id,
  });
  return { id: reference.id, ...payload };
};

export const subscribeToAdminWaitingList = (date, status, onData, onError) => {
  let unsubscribe = () => {};
  let cancelled = false;

  ensureFirebaseAdmin()
    .then(() => {
      if (cancelled) return;
      const constraints = [];
      if (date) constraints.push(where('date', '==', date));
      if (status && status !== 'all') constraints.push(where('status', '==', status));

      console.info('[Firestore] Admin waiting list listener subscribing', {
        projectId: firebaseProjectId,
        date: date || 'all',
        status: status || 'all',
      });

      unsubscribe = onSnapshot(
        query(waitingListCollection(), ...constraints),
        (snapshot) => {
          const entries = snapshot.docs.map(mapWaitingListEntry).sort(byNewestFirst);
          console.info('[Firestore] Admin waiting list snapshot received', {
            projectId: firebaseProjectId,
            size: snapshot.size,
          });
          onData(entries);
        },
        onError,
      );
    })
    .catch(onError);

  return () => {
    cancelled = true;
    unsubscribe();
  };
};

export const cancelWaitingListEntryByAdmin = async (waitingListId) => {
  await ensureFirebaseAdmin();
  await updateDoc(doc(getFirestoreDb(), 'waitingList', waitingListId), {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  });
};

export const deleteWaitingListEntryByAdmin = async (waitingListId) => {
  await ensureFirebaseAdmin();
  await deleteDoc(doc(getFirestoreDb(), 'waitingList', waitingListId));
};

export const manuallyNotifyWaitingListEntry = async (waitingListId) => {
  await ensureFirebaseAdmin();
  const callable = httpsCallable(getFirebaseFunctions(), 'manualNotifyWaitingListEntry');
  await callable({ waitingListId });
};
