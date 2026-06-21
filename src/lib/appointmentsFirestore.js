import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  ensureFirebaseAdmin,
  ensureFirebaseCustomer,
  firebaseProjectId,
  getFirebaseFunctions,
  getFirestoreDb,
  resolveFirebaseUserPhoneNumber,
} from '@/lib/firebase';

const appointmentsCollection = () => collection(getFirestoreDb(), 'appointments');

const bySchedule = (left, right) =>
  `${left.date || ''} ${left.startTime || ''}`.localeCompare(`${right.date || ''} ${right.startTime || ''}`);

const mapAppointment = (snapshot) => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    customer_name: data.customerName,
    customer_phone: data.customerPhone,
    customer_id: data.customerId,
    service_name: data.serviceName,
    service_id: data.serviceId,
    service_price: data.servicePrice,
    service_duration: data.serviceDuration,
    barber_id: data.barberId,
    barber_name: data.barberName,
    time: data.startTime,
    admin_notes: data.adminNotes,
    cancellation_reason: data.cancellationReason,
    cancelled_by: data.cancelledBy,
    cancelled_at: data.cancelledAt,
    is_phone_only_customer: !data.customerId && Boolean(data.customerPhone),
    created_date: data.createdAt?.toDate?.().toISOString?.() || null,
  };
};

const callAppointmentFunction = async (name, data) => {
  const callable = httpsCallable(getFirebaseFunctions(), name);
  const result = await callable(data);
  return /** @type {{ id: string }} */ (result.data);
};

export const createCustomerAppointment = async (input) => {
  console.info('[Firestore] Customer appointment write attempt', {
    projectId: firebaseProjectId,
    date: input.date,
    startTime: input.startTime || input.time,
    status: 'pending',
  });

  try {
    await ensureFirebaseCustomer();
    const appointment = await callAppointmentFunction('createCustomerAppointment', input);

    console.info('[Firestore] Customer appointment created', {
      projectId: firebaseProjectId,
      appointmentId: appointment.id,
      date: input.date,
      startTime: input.startTime || input.time,
      status: 'pending',
    });

    return { id: appointment.id, ...input, status: 'pending' };
  } catch (error) {
    console.error('[Firestore] Customer appointment write failed', {
      projectId: firebaseProjectId,
      code: error?.code || 'unknown',
      message: error?.message || 'Unknown Firestore error',
    });
    throw error;
  }
};

export const replaceCustomerAppointment = async (activeAppointmentId, input) => {
  console.info('[Firestore] Customer appointment replacement attempt', {
    projectId: firebaseProjectId,
    activeAppointmentId,
    date: input.date,
    startTime: input.startTime || input.time,
  });

  try {
    await ensureFirebaseCustomer();
    const replacement = await callAppointmentFunction('replaceCustomerAppointment', {
      activeAppointmentId,
      appointment: input,
    });
    console.info('[Firestore] Customer appointment replaced', {
      projectId: firebaseProjectId,
      activeAppointmentId,
      appointmentId: replacement.id,
    });
    return { id: replacement.id, ...input, status: 'pending' };
  } catch (error) {
    console.error('[Firestore] Customer appointment replacement failed', {
      projectId: firebaseProjectId,
      activeAppointmentId,
      code: error?.details?.code || error?.code || 'unknown',
      message: error?.message || 'Unknown Firestore error',
    });
    throw error;
  }
};

export const createAdminAppointment = async (input) => {
  const user = await ensureFirebaseAdmin();
  const appointment = await callAppointmentFunction('createAdminAppointment', input);

  console.info('[Firestore] Admin appointment created', {
    projectId: firebaseProjectId,
    appointmentId: appointment.id,
    adminUid: user.uid,
    status: input.status || 'pending',
  });

  return { id: appointment.id, ...input };
};

const normalizeChanges = (changes) => {
  const normalized = /** @type {Record<string, any>} */ ({});
  const aliases = {
    customer_name: 'customerName',
    customer_phone: 'customerPhone',
    customer_id: 'customerId',
    service_name: 'serviceName',
    service_id: 'serviceId',
    service_price: 'servicePrice',
    service_duration: 'serviceDuration',
    barber_id: 'barberId',
    barber_name: 'barberName',
    time: 'startTime',
    admin_notes: 'adminNotes',
    cancellation_reason: 'cancellationReason',
  };

  Object.entries(changes).forEach(([key, value]) => {
    if (key === 'durationMinutes' || value === undefined) return;
    normalized[aliases[key] || key] = value;
  });

  return normalized;
};

export const updateOwnAppointment = async (appointmentId, changes) => {
  await ensureFirebaseCustomer();
  await callAppointmentFunction('updateOwnAppointment', {
    appointmentId,
    changes: normalizeChanges(changes),
  });
};

export const updateAdminAppointment = async (appointmentId, changes) => {
  await ensureFirebaseAdmin();
  console.info('[Firestore] Admin appointment update attempt', {
    projectId: firebaseProjectId,
    appointmentId,
    status: changes.status || 'unchanged',
  });

  try {
    await callAppointmentFunction('updateAdminAppointment', {
      appointmentId,
      changes: normalizeChanges(changes),
    });
    console.info('[Firestore] Admin appointment updated', {
      projectId: firebaseProjectId,
      appointmentId,
      status: changes.status || 'unchanged',
    });
  } catch (error) {
    console.error('[Firestore] Admin appointment update failed', {
      projectId: firebaseProjectId,
      appointmentId,
      code: error?.code || 'unknown',
      message: error?.message || 'Unknown Firestore error',
    });
    throw error;
  }
};

export const cancelOwnAppointment = (appointmentId, cancellationReason = 'customer_cancelled') =>
  updateOwnAppointment(appointmentId, { status: 'cancelled', cancellationReason });

export const deleteAppointment = async (appointmentId) => {
  await ensureFirebaseAdmin();
  await callAppointmentFunction('deleteAdminAppointment', { appointmentId });
};

const logListenerError = (audience, stage, error) => {
  const details = {
    projectId: firebaseProjectId,
    code: error?.code || 'unknown',
    message: error?.message || 'Unknown Firestore error',
  };

  const isPermissionDenied = [
    'admin/not-authorized',
    'permission-denied',
    'firestore/permission-denied',
  ].includes(error?.code);

  if (audience === 'admin' && isPermissionDenied) {
    console.error('[Firestore] Admin appointments listener permission denied', details);
    return;
  }

  console.error(`[Firestore] ${audience} appointments listener ${stage}`, details);
};

const subscribe = async (buildQuery, audience, authenticate, onData, onError, isCancelled) => {
  const user = await authenticate();
  if (isCancelled()) return () => {};

  console.info(`[Firestore] ${audience} appointments listener subscribing`, {
    projectId: firebaseProjectId,
    audience,
  });

  return onSnapshot(
    buildQuery(user),
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
      logListenerError(audience, 'snapshot failed', error);
      onError(error);
    },
  );
};

const createRealtimeSubscription = (buildQuery, audience, authenticate, onData, onError) => {
  let unsubscribe = () => {};
  let cancelled = false;

  console.info(`[Firestore] ${audience} appointments listener subscription attempt`, {
    projectId: firebaseProjectId,
    audience,
  });

  subscribe(buildQuery, audience, authenticate, onData, onError, () => cancelled)
    .then((stopListening) => {
      unsubscribe = stopListening;
    })
    .catch((error) => {
      logListenerError(audience, 'subscription failed', error);
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

export const subscribeToCustomerAppointments = (onData, onError) =>
  (() => {
    let cancelled = false;
    let unsubscribers = [];
    const sourceDocs = {
      customerId: new Map(),
      customerPhone: new Map(),
    };

    const emitMergedAppointments = () => {
      const merged = new Map();
      [...sourceDocs.customerPhone.values(), ...sourceDocs.customerId.values()].forEach((appointment) => {
        merged.set(appointment.id, appointment);
      });
      onData([...merged.values()].sort(bySchedule));
    };

    console.info('[Firestore] customer appointments listener subscription attempt', {
      projectId: firebaseProjectId,
      audience: 'customer',
      matchBy: ['customerId', 'customerPhone'],
    });

    ensureFirebaseCustomer()
      .then(async (user) => {
        const phoneNumber = await resolveFirebaseUserPhoneNumber(user);
        if (cancelled) return;

        const subscriptions = [
          {
            key: 'customerId',
            queryRef: query(appointmentsCollection(), where('customerId', '==', user.uid)),
          },
        ];

        if (phoneNumber) {
          subscriptions.push({
            key: 'customerPhone',
            queryRef: query(appointmentsCollection(), where('customerPhone', '==', phoneNumber)),
          });
        }

        unsubscribers = subscriptions.map(({ key, queryRef }) => onSnapshot(
          queryRef,
          (snapshot) => {
            sourceDocs[key] = new Map(snapshot.docs.map((item) => [item.id, mapAppointment(item)]));
            console.info('[Firestore] Customer received appointments snapshot', {
              projectId: firebaseProjectId,
              audience: 'customer',
              matchBy: key,
              size: snapshot.size,
            });
            emitMergedAppointments();
          },
          (error) => {
            logListenerError('customer', `${key} snapshot failed`, error);
            onError(error);
          },
        ));
      })
      .catch((error) => {
        logListenerError('customer', 'subscription failed', error);
        onError(error);
      });

    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      unsubscribers = [];
    };
  })();
