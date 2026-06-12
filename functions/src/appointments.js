import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { addMinutes, BLOCKING_STATUSES, findConflict } from './scheduling.js';

const db = () => getFirestore();

const requireAuth = (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.');
  return request.auth;
};

const requireCustomer = (request) => {
  const auth = requireAuth(request);
  const provider = auth.token.firebase?.sign_in_provider;
  if (provider !== 'phone') {
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

const text = (value) => String(value || '').trim();
const positiveNumber = (value, fallback = 0) => Math.max(0, Number(value ?? fallback) || fallback);

const normalizeAppointment = (input, customerId, forcedStatus = null) => {
  const startTime = text(input.startTime || input.time);
  const serviceDuration = Math.max(1, positiveNumber(input.serviceDuration || input.service_duration, 30));
  const barberId = text(input.barberId || input.barber_id);

  if (!text(input.date) || !startTime || !barberId || !text(input.serviceId || input.service_id)) {
    throw new HttpsError('invalid-argument', 'date, startTime, barberId and serviceId are required.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(input.date)) || !/^\d{2}:\d{2}$/.test(startTime)) {
    throw new HttpsError('invalid-argument', 'date or startTime format is invalid.');
  }

  return {
    customerId,
    customerName: text(input.customerName || input.customer_name),
    customerPhone: text(input.customerPhone || input.customer_phone),
    serviceId: text(input.serviceId || input.service_id),
    serviceName: text(input.serviceName || input.service_name),
    servicePrice: positiveNumber(input.servicePrice || input.service_price),
    serviceDuration,
    barberId,
    barberName: text(input.barberName || input.barber_name),
    date: text(input.date),
    startTime,
    endTime: addMinutes(startTime, serviceDuration),
    status: forcedStatus || text(input.status) || 'pending',
    paid: input.paid === true,
    notes: text(input.notes),
    adminNotes: text(input.adminNotes || input.admin_notes),
  };
};

const getBuffer = async (transaction) => {
  const settings = await transaction.get(db().doc('settings/booking'));
  return Math.max(0, Number(settings.data()?.appointmentBufferMinutes || 0));
};

const getDayAppointments = async (transaction, date) => {
  const snapshot = await transaction.get(db().collection('appointments').where('date', '==', date));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

const rejectConflict = (conflict) => {
  if (conflict) {
    throw new HttpsError('already-exists', 'This appointment overlaps another appointment.', {
      code: 'appointment/conflict',
      conflictingAppointmentId: conflict.id,
    });
  }
};

export const createCustomerAppointment = onCall(async (request) => {
  const auth = requireCustomer(request);
  const requested = normalizeAppointment(request.data, auth.uid, 'pending');
  const ref = db().collection('appointments').doc();

  await db().runTransaction(async (transaction) => {
    const serviceSnapshot = await transaction.get(db().doc(`services/${requested.serviceId}`));
    const barberSnapshot = await transaction.get(db().doc(`barbers/${requested.barberId}`));
    const service = serviceSnapshot.data();
    const barber = barberSnapshot.data();
    if (!serviceSnapshot.exists || service?.active !== true) {
      throw new HttpsError('failed-precondition', 'The selected service is not active.');
    }
    if (!barberSnapshot.exists || barber?.active !== true || barber?.archived === true) {
      throw new HttpsError('failed-precondition', 'The selected barber is not active.');
    }
    const appointment = normalizeAppointment({
      ...requested,
      serviceName: service.name,
      servicePrice: service.price,
      serviceDuration: service.duration,
      barberName: barber.name,
    }, auth.uid, 'pending');
    const buffer = await getBuffer(transaction);
    const appointments = await getDayAppointments(transaction, appointment.date);
    rejectConflict(findConflict(appointment, appointments, buffer));
    transaction.set(ref, {
      ...appointment,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { id: ref.id };
});

export const createAdminAppointment = onCall(async (request) => {
  const auth = await requireAdmin(request);
  const appointment = normalizeAppointment(request.data, text(request.data.customerId) || auth.uid);
  const ref = db().collection('appointments').doc();

  await db().runTransaction(async (transaction) => {
    const buffer = await getBuffer(transaction);
    const appointments = await getDayAppointments(transaction, appointment.date);
    if (BLOCKING_STATUSES.has(appointment.status)) {
      rejectConflict(findConflict(appointment, appointments, buffer));
    }
    transaction.set(ref, {
      ...appointment,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { id: ref.id };
});

const updateAppointment = async (request, adminOnly) => {
  const auth = adminOnly ? await requireAdmin(request) : requireCustomer(request);
  const appointmentId = text(request.data.appointmentId);
  if (!appointmentId) throw new HttpsError('invalid-argument', 'appointmentId is required.');

  const ref = db().doc(`appointments/${appointmentId}`);
  await db().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Appointment not found.');
    const existing = snapshot.data();
    if (!adminOnly && existing.customerId !== auth.uid) {
      throw new HttpsError('permission-denied', 'Customers may only update their own appointments.');
    }

    const requested = request.data.changes || {};
    if (!adminOnly) {
      const allowed = new Set(['date', 'startTime', 'time', 'status']);
      const invalidKey = Object.keys(requested).find((key) => !allowed.has(key));
      if (invalidKey) {
        throw new HttpsError('permission-denied', `Customers cannot update ${invalidKey}.`);
      }
    }
    if (!adminOnly && requested.status && requested.status !== 'cancelled' && requested.status !== 'pending') {
      throw new HttpsError('permission-denied', 'Customers may only cancel or reschedule appointments.');
    }

    const merged = normalizeAppointment(
      { ...existing, ...requested },
      existing.customerId,
      requested.status || existing.status,
    );
    const buffer = await getBuffer(transaction);
    const appointments = await getDayAppointments(transaction, merged.date);
    if (BLOCKING_STATUSES.has(merged.status)) {
      rejectConflict(findConflict(merged, appointments, buffer, appointmentId));
    }

    transaction.update(ref, {
      ...merged,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { id: appointmentId };
};

export const updateAdminAppointment = onCall((request) => updateAppointment(request, true));
export const updateOwnAppointment = onCall((request) => updateAppointment(request, false));

export const deleteAdminAppointment = onCall(async (request) => {
  await requireAdmin(request);
  const appointmentId = text(request.data.appointmentId);
  if (!appointmentId) throw new HttpsError('invalid-argument', 'appointmentId is required.');
  await db().doc(`appointments/${appointmentId}`).delete();
  return { id: appointmentId };
});
