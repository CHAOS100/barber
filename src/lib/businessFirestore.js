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
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ensureFirebaseAdmin, getFirebaseFunctions, getFirestoreDb } from '@/lib/firebase';
import {
  DEFAULT_VISIBLE_SLOT_INTERVAL_MINUTES,
  DEFAULT_WORKING_HOURS,
  timeToMinutes,
} from '@/lib/slotEngine';
import { isBarberBookable } from '@/lib/barberStatus';
import { isActiveBookingSlotRelease } from '@/lib/bookingAvailability';

export { isBarberBookable };

const DEFAULT_SLOT_INTERVAL = 10;
export const DEFAULT_BOOKING_POLICY_TEXT = `חברים שימו ❤️ ממליץ להקדים את התור עקב מצוקת חניות באזור!
*יש לבחור תור לתספורת במידה ובחרת עם גזירות.
*איחורים מעל 10 דקות לא יתקבלו.
*במקרה של ביטולים ללא הודעה מראש יידרש 50 אחוז ממחיר התספורת בתור הבא.`;
export const DEFAULT_BOOKING_POLICY_VERSION = '2026-06-16';

const hasNumberValue = (value) => value !== undefined && value !== null && value !== '';
const normalizeOptionalMinutes = (value) =>
  hasNumberValue(value) ? Math.max(0, Number(value) || 0) : null;

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
  const active = data.active ?? data.is_active ?? true;
  return {
    id: snapshot.id,
    ...data,
    active,
    archived: data.archived === true,
    is_active: active !== false,
    photo_url: data.photoUrl || '',
    photo_storage_path: data.photoStoragePath || data.storagePath || '',
    instagram_url: data.instagramUrl || '',
    instagram_username: data.instagramUsername || '',
    sort_order: Number(data.sortOrder || 0),
  };
};

const normalizeService = (input) => ({
  name: String(input.name || '').trim(),
  description: String(input.description || '').trim(),
  category: String(input.category || '').trim(),
  price: Number(input.price || 0),
  duration: Math.max(1, Number(input.duration || 30)),
  bufferBeforeMinutes: null,
  bufferAfterMinutes: null,
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

const normalizeInstagramUrl = (input) => {
  const value = String(input || '').trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const username = value.replace(/^@/, '').replace(/^instagram\.com\//i, '').replace(/^www\.instagram\.com\//i, '');
  return username ? `https://instagram.com/${username}` : null;
};

const normalizeBarber = (input) => ({
  name: String(input.name || '').trim(),
  photoUrl: String(input.photoUrl || input.photo_url || '').trim(),
  photoStoragePath: String(input.photoStoragePath || input.photo_storage_path || '').trim() || null,
  instagramUrl: normalizeInstagramUrl(input.instagramUrl || input.instagram_url || input.instagramUsername),
  instagramUsername: String(input.instagramUsername || '').replace(/^@/, '').trim() || null,
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
    bufferBeforeMinutes: payload.bufferBeforeMinutes,
    bufferAfterMinutes: payload.bufferAfterMinutes,
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
  collection(getFirestoreDb(), 'barbers'),
  (snapshot) => onData(
    snapshot.docs
      .map(mapBarber)
      .filter(isBarberBookable)
      .sort((a, b) => a.sort_order - b.sort_order),
  ),
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

const imageContentType = (file) => {
  if (file?.type === 'image/jpg') return 'image/jpeg';
  if (file?.type) return file.type;
  const ext = String(file?.name || '').split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
};

export const uploadBarberPhoto = async (barberId, file, onProgress) => {
  const { getDownloadURL, ref: storageRef, uploadBytesResumable } = await import('firebase/storage');
  const { firebaseStorage } = await import('@/lib/firebase');

  const adminUser = await ensureFirebaseAdmin();
  const ext = (String(file.name || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const storagePath = `barbers/${barberId}/photo-${Date.now()}.${ext || 'jpg'}`;
  console.info('[IMAGE_UPLOAD]', JSON.stringify({ context: 'barber-photo', event: 'upload-start', storagePath, fileName: file.name, size: file.size }));
  const imageRef = storageRef(firebaseStorage, storagePath);
  const uploadTask = uploadBytesResumable(imageRef, file, {
    contentType: imageContentType(file),
    customMetadata: { uploadedBy: adminUser.uid },
  });

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (onProgress && snapshot.totalBytes) {
          onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        }
      },
      reject,
      async () => {
        try {
          const photoUrl = await getDownloadURL(uploadTask.snapshot.ref);
          await updateDoc(doc(getFirestoreDb(), 'barbers', barberId), {
            photoUrl,
            photoStoragePath: storagePath,
            photoUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          resolve(photoUrl);
        } catch (err) {
          reject(err);
        }
      },
    );
  });
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
      bufferBeforeMinutes: null,
      bufferAfterMinutes: null,
    };
  });

const mapBookingSettings = (data = {}) => {
  const appointmentBufferMinutes = Math.max(
    0,
    Number(
      data.appointmentBufferMinutes
      ?? data.defaultAppointmentBufferAfterMinutes
      ?? data.defaultAppointmentBufferBeforeMinutes
      ?? 0,
    ) || 0,
  );

  return {
    appointmentBufferMinutes,
    defaultAppointmentBufferBeforeMinutes: 0,
    defaultAppointmentBufferAfterMinutes: appointmentBufferMinutes,
    slotInterval: Math.max(1, Number(data.slotInterval || DEFAULT_SLOT_INTERVAL)),
    visibleSlotIntervalMinutes: Math.max(
      1,
      Number(data.visibleSlotIntervalMinutes || DEFAULT_VISIBLE_SLOT_INTERVAL_MINUTES),
    ),
    cancellationDeadlineMinutesBeforeAppointment: Math.max(
      0,
      Number(data.cancellationDeadlineMinutesBeforeAppointment ?? 180),
    ),
    workingHours: normalizeWorkingHours(data.workingHours),
    availabilityMode: data.availabilityMode === 'manual' ? 'manual' : 'automatic',
  };
};

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
  if (input.defaultAppointmentBufferBeforeMinutes !== undefined) {
    payload.defaultAppointmentBufferBeforeMinutes = Math.max(0, Number(input.defaultAppointmentBufferBeforeMinutes || 0));
  }
  if (input.defaultAppointmentBufferAfterMinutes !== undefined) {
    payload.defaultAppointmentBufferAfterMinutes = Math.max(0, Number(input.defaultAppointmentBufferAfterMinutes || 0));
  }
  if (input.slotInterval !== undefined) {
    payload.slotInterval = Math.max(1, Number(input.slotInterval || DEFAULT_SLOT_INTERVAL));
  }
  if (input.visibleSlotIntervalMinutes !== undefined) {
    payload.visibleSlotIntervalMinutes = Math.max(
      1,
      Number(input.visibleSlotIntervalMinutes || DEFAULT_VISIBLE_SLOT_INTERVAL_MINUTES),
    );
  }
  if (input.cancellationDeadlineMinutesBeforeAppointment !== undefined) {
    payload.cancellationDeadlineMinutesBeforeAppointment = Math.max(
      0,
      Number(input.cancellationDeadlineMinutesBeforeAppointment || 0),
    );
  }
  if (input.workingHours !== undefined) {
    payload.workingHours = normalizeWorkingHours(input.workingHours);
    validateWorkingHours(payload.workingHours);
  }
  if (input.availabilityMode !== undefined) {
    payload.availabilityMode = input.availabilityMode === 'manual' ? 'manual' : 'automatic';
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
    const data = snapshot.data() || {};
    const settings = {
      ...data,
      bookingPolicyText: data.bookingPolicyText || DEFAULT_BOOKING_POLICY_TEXT,
      bookingPolicyVersion: data.bookingPolicyVersion || DEFAULT_BOOKING_POLICY_VERSION,
      cancellationDeadlineMinutesBeforeAppointment: Math.max(
        0,
        Number(data.cancellationDeadlineMinutesBeforeAppointment ?? 180),
      ),
    };
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
    bookingPolicyText: String(input.bookingPolicyText || DEFAULT_BOOKING_POLICY_TEXT).trim(),
    bookingPolicyVersion: String(input.bookingPolicyVersion || DEFAULT_BOOKING_POLICY_VERSION).trim(),
    defaultAppointmentBufferBeforeMinutes: Math.max(
      0,
      Number(input.defaultAppointmentBufferBeforeMinutes ?? 0),
    ),
    defaultAppointmentBufferAfterMinutes: Math.max(
      0,
      Number(input.defaultAppointmentBufferAfterMinutes ?? 0),
    ),
    visibleSlotIntervalMinutes: Math.max(
      1,
      Number(input.visibleSlotIntervalMinutes ?? DEFAULT_VISIBLE_SLOT_INTERVAL_MINUTES),
    ),
    cancellationDeadlineMinutesBeforeAppointment: Math.max(
      0,
      Number(input.cancellationDeadlineMinutesBeforeAppointment ?? 180),
    ),
    // Social / contact links — editable by the admin in the app
    waze: String(input.waze || '').trim(),
    whatsapp: String(input.whatsapp || '').trim(),
    instagram: String(input.instagram || '').trim(),
    // Optional welcome / greeting text shown on the customer Home page
    welcomeText: String(input.welcomeText || '').trim(),
    // Push notification global control — admin can disable all automatic push reminders
    automaticPushRemindersEnabled: input.automaticPushRemindersEnabled !== false,
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

export const DEFAULT_FEATURES = [
  { id: 'f1', icon: '✂️', title: 'תספורת מקצועית', description: 'גזירות מדויקות ומעוצבות', enabled: true, order: 0 },
  { id: 'f2', icon: '🧔', title: 'עיצוב זקן', description: 'עיצוב וטיפוח זקן איכותי', enabled: true, order: 1 },
  { id: 'f3', icon: '⭐', title: 'שירות אישי', description: 'יחס אישי ומקצועי לכל לקוח', enabled: true, order: 2 },
  { id: 'f4', icon: '💎', title: 'אווירה יוקרתית', description: 'חוויה מפנקת ואיכותית', enabled: true, order: 3 },
  { id: 'f5', icon: '💈', title: 'חומרים איכותיים', description: 'מוצרים מהשורה הראשונה', enabled: true, order: 4 },
  { id: 'f6', icon: '📅', title: 'זמינות נוחה', description: 'הזמנת תורים קלה ומהירה', enabled: true, order: 5 },
];

export const saveBusinessFeatures = async (features) => {
  await ensureFirebaseAdmin();
  const normalized = features.map((f, i) => ({
    id: String(f.id || `f_${i}`),
    title: String(f.title || '').trim(),
    description: String(f.description || '').trim(),
    icon: String(f.icon || '✂️').trim(),
    enabled: f.enabled !== false,
    order: Number(f.order ?? i),
  }));
  await setDoc(doc(getFirestoreDb(), 'settings', 'business'), {
    features: normalized,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  console.info('[Firestore Settings] features saved', { count: normalized.length });
  return normalized;
};

export const uploadHeroImage = async (file, onProgress) => {
  const { getDownloadURL, ref: storageRef, uploadBytesResumable } = await import('firebase/storage');
  const { firebaseStorage } = await import('@/lib/firebase');
  const adminUser = await ensureFirebaseAdmin();
  const ext = (String(file.name || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const storagePath = `settings/hero/hero-${Date.now()}.${ext || 'jpg'}`;
  console.info('[IMAGE_UPLOAD]', JSON.stringify({ context: 'settings-hero-image', event: 'upload-start', storagePath, fileName: file.name, size: file.size }));
  const imageRef = storageRef(firebaseStorage, storagePath);
  const uploadTask = uploadBytesResumable(imageRef, file, {
    contentType: imageContentType(file),
    customMetadata: { uploadedBy: adminUser.uid },
  });
  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (onProgress && snapshot.totalBytes) {
          onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        }
      },
      (err) => {
        console.error('[IMAGE_UPLOAD]', JSON.stringify({ context: 'settings-hero-image', event: 'upload-error', code: err?.code, message: err?.message }));
        reject(err);
      },
      async () => {
        try {
          const homeHeroImageUrl = await getDownloadURL(uploadTask.snapshot.ref);
          await setDoc(doc(getFirestoreDb(), 'settings', 'business'), {
            homeHeroImageUrl,
            homeHeroImagePath: storagePath,
            homeHeroImageUpdatedAt: serverTimestamp(),
          }, { merge: true });
          console.info('[IMAGE_UPLOAD]', JSON.stringify({ context: 'settings-hero-image', event: 'upload-success', storagePath }));
          resolve(homeHeroImageUrl);
        } catch (err) {
          console.error('[IMAGE_UPLOAD]', JSON.stringify({ context: 'settings-hero-image', event: 'firestore-save-error', message: err?.message }));
          reject(err);
        }
      },
    );
  });
};

export const uploadProfileImage = async (file, onProgress) => {
  const { getDownloadURL, ref: storageRef, uploadBytesResumable } = await import('firebase/storage');
  const { firebaseStorage } = await import('@/lib/firebase');
  const adminUser = await ensureFirebaseAdmin();
  const ext = (String(file.name || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const storagePath = `settings/profile/profile-${Date.now()}.${ext || 'jpg'}`;
  console.info('[IMAGE_UPLOAD]', JSON.stringify({ context: 'settings-profile-image', event: 'upload-start', storagePath, fileName: file.name, size: file.size }));
  const imageRef = storageRef(firebaseStorage, storagePath);
  const uploadTask = uploadBytesResumable(imageRef, file, {
    contentType: imageContentType(file),
    customMetadata: { uploadedBy: adminUser.uid },
  });
  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (onProgress && snapshot.totalBytes) {
          onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        }
      },
      (err) => {
        console.error('[IMAGE_UPLOAD]', JSON.stringify({ context: 'settings-profile-image', event: 'upload-error', code: err?.code, message: err?.message }));
        reject(err);
      },
      async () => {
        try {
          const profileImageUrl = await getDownloadURL(uploadTask.snapshot.ref);
          await setDoc(doc(getFirestoreDb(), 'settings', 'business'), {
            profileImageUrl,
            profileImagePath: storagePath,
            profileImageUpdatedAt: serverTimestamp(),
          }, { merge: true });
          console.info('[IMAGE_UPLOAD]', JSON.stringify({ context: 'settings-profile-image', event: 'upload-success', storagePath }));
          resolve(profileImageUrl);
        } catch (err) {
          console.error('[IMAGE_UPLOAD]', JSON.stringify({ context: 'settings-profile-image', event: 'firestore-save-error', message: err?.message }));
          reject(err);
        }
      },
    );
  });
};

export const subscribeToAppointmentBlocks = (date, onData, onError) => onSnapshot(
  query(collection(getFirestoreDb(), 'appointmentBlocks'), where('date', '==', date)),
  (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
  onError,
);

export const subscribeToBookingSlotReleases = (date, onData, onError) => onSnapshot(
  query(
    collection(getFirestoreDb(), 'bookingSlotReleases'),
    where('date', '==', date),
  ),
  (snapshot) => onData(
    snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter(isActiveBookingSlotRelease),
  ),
  onError,
);

export const subscribeToUpcomingBookingSlotReleases = (fromDate, onData, onError) => onSnapshot(
  query(
    collection(getFirestoreDb(), 'bookingSlotReleases'),
    where('date', '>=', fromDate),
  ),
  (snapshot) => onData(
    snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter(isActiveBookingSlotRelease)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
  ),
  onError,
);

export const subscribeToBookingSlotReleasesAll = (sinceDate, onData, onError) => onSnapshot(
  query(
    collection(getFirestoreDb(), 'bookingSlotReleases'),
    where('date', '>=', sinceDate),
  ),
  (snapshot) => onData(
    snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter(isActiveBookingSlotRelease)
      .sort((a, b) => a.date.localeCompare(b.date)),
  ),
  onError,
);

export const callPublishManualSlotRelease = async (input) => {
  await ensureFirebaseAdmin();
  const fn = httpsCallable(getFirebaseFunctions(), 'publishManualSlotRelease');
  const result = await fn(input);
  console.info('[Firestore SlotReleases] batch published', result.data);
  return result.data;
};

export const cancelBookingSlotRelease = async (id) => {
  await ensureFirebaseAdmin();
  await updateDoc(doc(getFirestoreDb(), 'bookingSlotReleases', id), {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  });
  console.info('[Firestore SlotReleases] slot release cancelled', { id });
};

export const cancelBookingSlotReleaseBatch = async (releaseBatchId) => {
  await ensureFirebaseAdmin();
  const db = getFirestoreDb();
  const today = new Date().toISOString().slice(0, 10);
  const snap = await getDocs(query(
    collection(db, 'bookingSlotReleases'),
    where('releaseBatchId', '==', releaseBatchId),
    where('status', '==', 'active'),
  ));
  const futureActive = snap.docs.filter((d) => (d.data().date || '') >= today);
  if (futureActive.length === 0) return { count: 0 };
  const batch = writeBatch(db);
  futureActive.forEach((d) => {
    batch.update(d.ref, { status: 'cancelled', updatedAt: serverTimestamp() });
  });
  await batch.commit();
  console.info('[Firestore SlotReleases] batch cancelled', { releaseBatchId, count: futureActive.length });
  return { count: futureActive.length };
};
