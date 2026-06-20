import {
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
  firebaseAuth,
  firebaseProjectId,
  getFirebaseFunctions,
  getFirestoreDb,
} from '@/lib/firebase';

const waitingListCollection = () => collection(getFirestoreDb(), 'waitingList');

export const WAITING_LIST_STATUSES = ['active', 'notified', 'booked', 'cancelled', 'expired'];
export const WAITING_LIST_PREFERENCE_TYPES = ['exact_time', 'time_range', 'day_part', 'whole_day'];

const byNewestFirst = (left, right) => {
  const leftTime = left.createdAt?.toMillis?.() || 0;
  const rightTime = right.createdAt?.toMillis?.() || 0;
  return rightTime - leftTime;
};

const waitingListScheduleKey = (entry) =>
  `${entry.date || ''} ${entry.exactTime || entry.startTime || entry.availableStartTime || '99:99'}`;

const bySchedule = (left, right) => {
  const scheduled = waitingListScheduleKey(left).localeCompare(waitingListScheduleKey(right));
  if (scheduled !== 0) return scheduled;
  return byNewestFirst(left, right);
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
  await ensureFirebaseCustomer();

  const preferenceType = input.preferenceType || 'whole_day';
  if (!WAITING_LIST_PREFERENCE_TYPES.includes(preferenceType)) {
    throw Object.assign(new Error('Invalid waiting list preference type.'), {
      code: 'waiting-list/invalid-preference',
    });
  }

  const payload = cleanOptionalFields({
    date: input.date,
    preferenceType,
    exactTime: preferenceType === 'exact_time' ? input.exactTime : undefined,
    startTime: preferenceType === 'time_range' ? input.startTime : undefined,
    endTime: preferenceType === 'time_range' ? input.endTime : undefined,
    dayPart: preferenceType === 'day_part' ? input.dayPart : undefined,
    serviceId: input.serviceId,
    serviceName: input.serviceName,
    barberId: input.barberId,
    barberName: input.barberName,
    expiresAt: input.expiresAt || null,
  });

  console.info('[Firestore] Waiting list create attempt', {
    projectId: firebaseProjectId,
    date: payload.date,
    preferenceType,
    serviceId: payload.serviceId || null,
  });

  const callable = httpsCallable(getFirebaseFunctions(), 'createCustomerWaitingListEntry');
  const result = await callable(payload);
  const reference = /** @type {{ data?: { id?: string } }} */ (result).data || {};
  console.info('[Firestore] Waiting list entry created', {
    projectId: firebaseProjectId,
    waitingListId: reference.id || null,
  });
  return { id: reference.id, ...payload };
};

export const subscribeToCustomerWaitingList = (onData, onError) => {
  let unsubscribe = () => {};
  let cancelled = false;

  ensureFirebaseCustomer()
    .then((firebaseUser) => {
      if (cancelled) return;

      unsubscribe = onSnapshot(
        query(
          waitingListCollection(),
          where('customerId', '==', firebaseUser.uid),
          where('status', 'in', ['active', 'notified']),
        ),
        (snapshot) => {
          const entries = snapshot.docs.map(mapWaitingListEntry).sort(bySchedule);
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

export const cancelOwnWaitingListEntry = async (waitingListId) => {
  await ensureFirebaseCustomer();
  await updateDoc(doc(getFirestoreDb(), 'waitingList', waitingListId), {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  });
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
          const entries = snapshot.docs.map(mapWaitingListEntry).sort(bySchedule);
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
  const token = await firebaseAuth.currentUser.getIdToken();
  const functionUrl = `https://us-central1-${firebaseProjectId}.cloudfunctions.net/manualNotifyWaitingListEntry`;
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ waitingListId }),
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok || result?.ok === false) {
    throw Object.assign(
      new Error(result?.error?.message || 'Waiting list notification failed.'),
      { code: result?.error?.code || `http/${response.status}` },
    );
  }

  return result;
};
