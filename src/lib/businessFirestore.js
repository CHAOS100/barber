import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { ensureFirebaseAdmin, getFirestoreDb } from '@/lib/firebase';

const mapService = (snapshot) => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    is_active: data.active !== false,
    sort_order: Number(data.sortOrder || 0),
  };
};

const mapBarber = (snapshot) => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    is_active: data.active !== false,
    photo_url: data.photoUrl || '',
    sort_order: Number(data.sortOrder || 0),
  };
};

const normalizeService = (input) => ({
  name: String(input.name || '').trim(),
  description: String(input.description || '').trim(),
  category: String(input.category || '').trim(),
  price: Number(input.price || 0),
  duration: Math.max(1, Number(input.duration || 30)),
  active: input.active ?? input.is_active ?? true,
  sortOrder: Number(input.sortOrder || input.sort_order || 0),
  updatedAt: serverTimestamp(),
});

const normalizeBarber = (input) => ({
  name: String(input.name || '').trim(),
  photoUrl: String(input.photoUrl || input.photo_url || '').trim(),
  specialties: Array.isArray(input.specialties)
    ? input.specialties.filter(Boolean)
    : String(input.specialties || '').split(',').map((item) => item.trim()).filter(Boolean),
  active: input.active ?? input.is_active ?? true,
  archived: input.archived === true,
  workingHours: input.workingHours || null,
  sortOrder: Number(input.sortOrder || input.sort_order || 0),
  updatedAt: serverTimestamp(),
});

export const listActiveServices = async () => {
  const snapshot = await getDocs(query(
    collection(getFirestoreDb(), 'services'),
    where('active', '==', true),
  ));
  return snapshot.docs.map(mapService).sort((a, b) => a.sort_order - b.sort_order);
};

export const listAllServices = async () => {
  await ensureFirebaseAdmin();
  const snapshot = await getDocs(query(collection(getFirestoreDb(), 'services'), orderBy('sortOrder')));
  return snapshot.docs.map(mapService);
};

export const saveService = async (id, input) => {
  await ensureFirebaseAdmin();
  const payload = normalizeService(input);
  if (id) {
    await updateDoc(doc(getFirestoreDb(), 'services', id), payload);
    return id;
  }
  const created = await addDoc(collection(getFirestoreDb(), 'services'), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return created.id;
};

export const deleteService = async (id) => {
  await ensureFirebaseAdmin();
  await deleteDoc(doc(getFirestoreDb(), 'services', id));
};

export const subscribeToActiveBarbers = (onData, onError) => onSnapshot(
  query(
    collection(getFirestoreDb(), 'barbers'),
    where('active', '==', true),
    where('archived', '==', false),
  ),
  (snapshot) => onData(snapshot.docs.map(mapBarber).sort((a, b) => a.sort_order - b.sort_order)),
  onError,
);

export const listAllBarbers = async () => {
  await ensureFirebaseAdmin();
  const snapshot = await getDocs(collection(getFirestoreDb(), 'barbers'));
  return snapshot.docs.map(mapBarber).sort((a, b) => a.sort_order - b.sort_order);
};

export const saveBarber = async (id, input) => {
  await ensureFirebaseAdmin();
  const payload = normalizeBarber(input);
  if (id) {
    await updateDoc(doc(getFirestoreDb(), 'barbers', id), payload);
    return id;
  }
  const created = await addDoc(collection(getFirestoreDb(), 'barbers'), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return created.id;
};

export const archiveBarber = async (id) => {
  await ensureFirebaseAdmin();
  await updateDoc(doc(getFirestoreDb(), 'barbers', id), {
    active: false,
    archived: true,
    updatedAt: serverTimestamp(),
  });
};

export const deleteBarber = async (id) => {
  await ensureFirebaseAdmin();
  await deleteDoc(doc(getFirestoreDb(), 'barbers', id));
};

export const getBookingSettings = async () => {
  const snapshot = await getDoc(doc(getFirestoreDb(), 'settings', 'booking'));
  return {
    appointmentBufferMinutes: Math.max(0, Number(snapshot.data()?.appointmentBufferMinutes || 0)),
  };
};

export const saveBookingSettings = async (input) => {
  await ensureFirebaseAdmin();
  const appointmentBufferMinutes = Math.max(0, Number(input.appointmentBufferMinutes || 0));
  await setDoc(doc(getFirestoreDb(), 'settings', 'booking'), {
    appointmentBufferMinutes,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return { appointmentBufferMinutes };
};

export const subscribeToAppointmentBlocks = (date, onData, onError) => onSnapshot(
  query(collection(getFirestoreDb(), 'appointmentBlocks'), where('date', '==', date)),
  (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
  onError,
);
