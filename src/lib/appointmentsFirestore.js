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
import {
  ensureFirebaseAdmin,
  ensureFirebaseCustomer,
  firebaseProjectId,
  firestoreDb,
} from '@/lib/firebase';

const appointmentsCollection = () => collection(firestoreDb, 'appointments');

const addMinutes = (startTime, durationMinutes) => {
  const [hours, minutes] = String(startTime || '00:00').split(':').map(Number);
  const totalMinutes = (hours * 60) + minutes + Number(durationMinutes || 30);
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;
  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
};

const bySchedule = (left, right) =>
  `${left.date || ''} ${left.startTime || ''}`.localeCompare(`${right.date || ''} ${right.startTime || ''}`);

const mapAppointment = (snapshot) => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    customer_name: data.customerName,
    customer_phone: data.customerPhone,
    service_name: data.serviceName,
    service_id: data.serviceId,
    service_price: data.servicePrice,
    service_duration: data.serviceDuration,
    barber_id: data.barberId,
    barber_name: data.barberName,
    time: data.startTime,
    admin_notes: data.adminNotes,
    created_date: data.createdAt?.toDate?.().toISOString?.() || null,
  };
};

const normalizeAppointment = (input, customerId) => {
  const startTime = input.startTime || input.time;
  const serviceDuration = Number(input.serviceDuration || input.service_duration || 30);

  return {
    customerId,
    customerName: input.customerName || input.customer_name || '',
    customerPhone: input.customerPhone || input.customer_phone || '',
    serviceName: input.serviceName || input.service_name || '',
    serviceId: input.serviceId || input.service_id || '',
    barberId: input.barberId || input.barber_id || null,
    barberName: input.barberName || input.barber_name || null,
    date: input.date,
    startTime,
    endTime: input.endTime || addMinutes(startTime, serviceDuration),
    status: 'pending',
    createdAt: serverTimestamp(),
    servicePrice: Number(input.servicePrice || input.service_price || 0),
    serviceDuration,
    notes: input.notes || '',
  };
};

export const createCustomerAppointment = async (input) => {
  const user = await ensureFirebaseCustomer();
  const payload = normalizeAppointment(input, user.uid);
  const appointment = await addDoc(appointmentsCollection(), payload);

  console.info('[Firestore] Appointment created', {
    projectId: firebaseProjectId,
    appointmentId: appointment.id,
    customerId: user.uid,
    date: payload.date,
    startTime: payload.startTime,
    status: payload.status,
  });

  return { id: appointment.id, ...payload };
};

export const createAdminAppointment = async (input) => {
  const user = await ensureFirebaseAdmin();
  const payload = normalizeAppointment(input, input.customerId || user.uid);
  const appointment = await addDoc(appointmentsCollection(), payload);

  console.info('[Firestore] Admin appointment created', {
    projectId: firebaseProjectId,
    appointmentId: appointment.id,
    adminUid: user.uid,
    status: payload.status,
  });

  return { id: appointment.id, ...payload };
};

const normalizeChanges = (changes) => {
  const normalized = /** @type {Record<string, any>} */ ({});
  const durationMinutes = changes.durationMinutes || changes.serviceDuration || changes.service_duration || 30;
  const aliases = {
    customer_name: 'customerName',
    customer_phone: 'customerPhone',
    service_name: 'serviceName',
    service_id: 'serviceId',
    service_price: 'servicePrice',
    service_duration: 'serviceDuration',
    barber_id: 'barberId',
    barber_name: 'barberName',
    time: 'startTime',
    admin_notes: 'adminNotes',
  };

  Object.entries(changes).forEach(([key, value]) => {
    if (key === 'durationMinutes' || value === undefined) return;
    normalized[aliases[key] || key] = value;
  });

  if (normalized.startTime) {
    normalized.endTime = addMinutes(normalized.startTime, durationMinutes);
  }

  normalized.updatedAt = serverTimestamp();
  return normalized;
};

const updateAppointment = async (appointmentId, changes) => {
  await updateDoc(doc(firestoreDb, 'appointments', appointmentId), normalizeChanges(changes));
};

export const updateOwnAppointment = async (appointmentId, changes) => {
  await ensureFirebaseCustomer();
  await updateAppointment(appointmentId, changes);
};

export const updateAdminAppointment = async (appointmentId, changes) => {
  await ensureFirebaseAdmin();
  await updateAppointment(appointmentId, changes);
};

export const cancelOwnAppointment = (appointmentId) =>
  updateOwnAppointment(appointmentId, { status: 'cancelled' });

export const deleteAppointment = async (appointmentId) => {
  await ensureFirebaseAdmin();
  await deleteDoc(doc(firestoreDb, 'appointments', appointmentId));
};

const subscribe = async (appointmentQuery, audience, authenticate, onData, onError, isCancelled) => {
  await authenticate();
  if (isCancelled()) return () => {};

  return onSnapshot(
    appointmentQuery,
    (snapshot) => {
      const appointments = snapshot.docs.map(mapAppointment).sort(bySchedule);
      console.info(
        audience === 'admin'
          ? '[Firestore] Admin received appointments snapshot'
          : '[Firestore] Customer received appointments snapshot',
        {
        projectId: firebaseProjectId,
        audience,
        size: snapshot.size,
        pending: appointments.filter((appointment) => appointment.status === 'pending').length,
        },
      );
      onData(appointments);
    },
    (error) => {
      console.error(`[Firestore] ${audience} appointments snapshot failed`, error);
      onError(error);
    },
  );
};

const createRealtimeSubscription = (buildQuery, audience, authenticate, onData, onError) => {
  let unsubscribe = () => {};
  let cancelled = false;

  subscribe(buildQuery(), audience, authenticate, onData, onError, () => cancelled)
    .then((stopListening) => {
      unsubscribe = stopListening;
    })
    .catch((error) => {
      console.error(`[Firestore] ${audience} appointments listener failed`, error);
      onError(error);
    });

  return () => {
    cancelled = true;
    unsubscribe();
  };
};

export const subscribeToAdminAppointments = (onData, onError) =>
  createRealtimeSubscription(
    () => query(appointmentsCollection()),
    'admin',
    ensureFirebaseAdmin,
    onData,
    onError,
  );

export const subscribeToCustomerAppointments = (onData, onError) => {
  let unsubscribe = () => {};
  let cancelled = false;

  ensureFirebaseCustomer()
    .then((user) => subscribe(
      query(appointmentsCollection(), where('customerId', '==', user.uid)),
      'customer',
      ensureFirebaseCustomer,
      onData,
      onError,
      () => cancelled,
    ))
    .then((stopListening) => {
      unsubscribe = stopListening;
    })
    .catch((error) => {
      console.error('[Firestore] Customer appointments listener failed', error);
      onError(error);
    });

  return () => {
    cancelled = true;
    unsubscribe();
  };
};
