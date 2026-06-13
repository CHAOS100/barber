import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { ensureFirebaseAdmin, getFirestoreDb } from '@/lib/firebase';
import { DEFAULT_WORKING_HOURS, timeToMinutes } from '@/lib/slotEngine';

const DEFAULT_SLOT_INTERVAL = 10;

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

const validateService = (input) => {
  const name = String(input.name || '').trim();
  const price = Number(input.price);
  const duration = Number(input.duration);

  if (!name) throw Object.assign(new Error('Service name is required.'), { code: 'service/name-required' });
  if (!Number.isFinite(price) || price <= 0) {
    throw Object.assign(new Error('Service price is required.'), { code: 'service/price-required' });
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw Object.assign(new Error('Service duration is required.'), { code: 'service/duration-required' });
  }
};

const mapServices = (snapshot) =>
  snapshot.docs.map(mapService).sort((a, b) => a.sort_order - b.sort_order);

const createAuthenticatedSubscription = (authenticate, buildQuery, mapSnapshot, onData, onError) => {
  let unsubscribe = () => {};
  let cancelled = false;

  authenticate()
    .then(() => {
      if (cancelled) return;
      unsubscribe = onSnapshot(buildQuery(), (snapshot) => {
        const data = mapSnapshot(snapshot);
        onData(data);
      }, onError);
    })
    .catch(onError);

  return () => {
    cancelled = true;
    unsubscribe();
  };
};

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

const validateWorkingHours = (workingHours) => {
  workingHours.filter(day => day.is_open).forEach((day) => {
    if (timeToMinutes(day.open_time) >= timeToMinutes(day.close_time)) {
      throw Object.assign(
        new Error(`Closing time must be after opening time for day ${day.day_of_week}.`),
        { code: 'settings/invalid-working-hours' },
      );
    }
  });
};

export const listActiveServices = async () => {
  const snapshot = await getDocs(query(
    collection(getFirestoreDb(), 'services'),
    where('active', '==', true),
  ));
  const services = mapServices(snapshot);
  console.info('[Firestore Services] active services loaded', { count: services.length });
  return services;
};

export const listAllServices = async () => {
  await ensureFirebaseAdmin();
  const snapshot = await getDocs(collection(getFirestoreDb(), 'services'));
  const services = mapServices(snapshot);
  console.info('[Firestore Services] admin services loaded', { count: services.length });
  return services;
};

export const subscribeToActiveServices = (onData, onError) => onSnapshot(
  query(collection(getFirestoreDb(), 'services'), where('active', '==', true)),
  (snapshot) => {
    const services = mapServices(snapshot);
    console.info('[Firestore Services] active services snapshot', { count: services.length });
    onData(services);
  },
  onError,
);

export const subscribeToAllServices = (onData, onError) =>
  createAuthenticatedSubscription(
    ensureFirebaseAdmin,
    () => collection(getFirestoreDb(), 'services'),
    (snapshot) => {
      const services = mapServices(snapshot);
      console.info('[Firestore Services] admin services snapshot', { count: services.length });
      return services;
    },
    onData,
    onError,
  );

export const saveService = async (id, input) => {
  await ensureFirebaseAdmin();
  validateService(input);
  const payload = normalizeService(input);
  console.info(`[Firestore Services] ${id ? 'update' : 'create'} service payload`, {
    serviceId: id || null,
    name: payload.name,
    price: payload.price,
    duration: payload.duration,
    active: payload.active,
    category: payload.category,
  });
  if (id) {
    await updateDoc(doc(getFirestoreDb(), 'services', id), payload);
    console.info('[Firestore Services] service updated', { serviceId: id });
    return { id, ...payload, is_active: payload.active, sort_order: payload.sortOrder };
  }
  const created = await addDoc(collection(getFirestoreDb(), 'services'), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  console.info('[Firestore Services] service created', { serviceId: created.id });
  return { id: created.id, ...payload, is_active: payload.active, sort_order: payload.sortOrder };
};

export const deleteService = async (id) => {
  await ensureFirebaseAdmin();
  console.info('[Firestore Services] deleting service', { serviceId: id });
  await deleteDoc(doc(getFirestoreDb(), 'services', id));
  console.info('[Firestore Services] service deleted', { serviceId: id });
  return id;
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
  const barbers = snapshot.docs.map(mapBarber).sort((a, b) => a.sort_order - b.sort_order);
  console.info('[Firestore Barbers] admin barbers loaded', { count: barbers.length });
  return barbers;
};

export const subscribeToAllBarbers = (onData, onError) =>
  createAuthenticatedSubscription(
    ensureFirebaseAdmin,
    () => collection(getFirestoreDb(), 'barbers'),
    (snapshot) => {
      const barbers = snapshot.docs.map(mapBarber).sort((a, b) => a.sort_order - b.sort_order);
      console.info('[Firestore Barbers] admin barbers snapshot', { count: barbers.length });
      return barbers;
    },
    onData,
    onError,
  );

export const saveBarber = async (id, input) => {
  await ensureFirebaseAdmin();
  if (!String(input.name || '').trim()) {
    throw Object.assign(new Error('Barber name is required.'), { code: 'barber/name-required' });
  }
  const payload = normalizeBarber(input);
  console.info(`[Firestore Barbers] ${id ? 'update' : 'create'} barber`, {
    barberId: id || null,
    name: payload.name,
    active: payload.active,
    archived: payload.archived,
  });
  if (id) {
    await updateDoc(doc(getFirestoreDb(), 'barbers', id), payload);
    console.info('[Firestore Barbers] barber updated', { barberId: id });
    return id;
  }
  const created = await addDoc(collection(getFirestoreDb(), 'barbers'), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  console.info('[Firestore Barbers] barber created', { barberId: created.id });
  return created.id;
};

export const archiveBarber = async (id) => {
  await ensureFirebaseAdmin();
  console.info('[Firestore Barbers] archiving barber', { barberId: id });
  await updateDoc(doc(getFirestoreDb(), 'barbers', id), {
    active: false,
    archived: true,
    updatedAt: serverTimestamp(),
  });
  console.info('[Firestore Barbers] barber archived', { barberId: id });
};

export const deleteBarber = async (id) => {
  await ensureFirebaseAdmin();
  console.info('[Firestore Barbers] deleting barber', { barberId: id });
  await deleteDoc(doc(getFirestoreDb(), 'barbers', id));
  console.info('[Firestore Barbers] barber deleted', { barberId: id });
};

const normalizeWorkingHours = (workingHours = DEFAULT_WORKING_HOURS) =>
  DEFAULT_WORKING_HOURS.map((defaultDay) => {
    const input = workingHours.find((day) => day.day_of_week === defaultDay.day_of_week) || defaultDay;
    return {
      day_of_week: defaultDay.day_of_week,
      day_name: input.day_name || defaultDay.day_name,
      is_open: input.is_open === true,
      open_time: input.open_time || defaultDay.open_time || '09:00',
      close_time: input.close_time || defaultDay.close_time || '20:00',
      breaks: Array.isArray(input.breaks) ? input.breaks : [],
    };
  });

const mapBookingSettings = (data = {}) => ({
  appointmentBufferMinutes: Math.max(0, Number(data.appointmentBufferMinutes || 0)),
  slotInterval: Math.max(1, Number(data.slotInterval || DEFAULT_SLOT_INTERVAL)),
  workingHours: normalizeWorkingHours(data.workingHours),
});

export const getBookingSettings = async () => {
  const snapshot = await getDoc(doc(getFirestoreDb(), 'settings', 'booking'));
  const settings = mapBookingSettings(snapshot.data());
  console.info('[Firestore Settings] booking settings loaded', settings);
  return settings;
};

export const saveBookingSettings = async (input) => {
  await ensureFirebaseAdmin();
  const payload = /** @type {Record<string, any>} */ ({});
  if (input.appointmentBufferMinutes !== undefined) {
    payload.appointmentBufferMinutes = Math.max(0, Number(input.appointmentBufferMinutes || 0));
  }
  if (input.slotInterval !== undefined) {
    payload.slotInterval = Math.max(1, Number(input.slotInterval || DEFAULT_SLOT_INTERVAL));
  }
  if (input.workingHours !== undefined) {
    payload.workingHours = normalizeWorkingHours(input.workingHours);
    validateWorkingHours(payload.workingHours);
  }
  console.info('[Firestore Settings] saving booking settings', payload);
  await setDoc(doc(getFirestoreDb(), 'settings', 'booking'), {
    ...payload,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  console.info('[Firestore Settings] booking settings saved', payload);
  return payload;
};

export const subscribeToBookingSettings = (onData, onError) => onSnapshot(
  doc(getFirestoreDb(), 'settings', 'booking'),
  (snapshot) => {
    const settings = mapBookingSettings(snapshot.data());
    console.info('[Firestore Settings] booking settings snapshot', settings);
    onData(settings);
  },
  onError,
);

export const subscribeToBusinessSettings = (onData, onError) => onSnapshot(
  doc(getFirestoreDb(), 'settings', 'business'),
  (snapshot) => {
    const settings = snapshot.data() || {};
    console.info('[Firestore Settings] business settings snapshot', {
      exists: snapshot.exists(),
      name: settings.name || '',
    });
    onData(settings);
  },
  onError,
);

export const saveBusinessSettings = async (input) => {
  await ensureFirebaseAdmin();
  const payload = {
    name: String(input.name || '').trim(),
    phone: String(input.phone || '').trim(),
    address: String(input.address || '').trim(),
    description: String(input.description || '').trim(),
  };
  console.info('[Firestore Settings] saving business settings', {
    name: payload.name,
    hasPhone: Boolean(payload.phone),
    hasAddress: Boolean(payload.address),
  });
  await setDoc(doc(getFirestoreDb(), 'settings', 'business'), {
    ...payload,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  console.info('[Firestore Settings] business settings saved');
  return payload;
};

export const subscribeToAppointmentBlocks = (date, onData, onError) => onSnapshot(
  query(collection(getFirestoreDb(), 'appointmentBlocks'), where('date', '==', date)),
  (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
  onError,
);
