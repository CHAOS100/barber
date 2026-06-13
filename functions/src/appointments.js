import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  addMinutes,
  BLOCKING_STATUSES,
  DEFAULT_WORKING_HOURS,
  findConflict,
  getScheduleRejectionCode,
} from './scheduling.js';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  findActiveCustomerAppointment,
  isCustomerBlocked,
} from './bookingPolicy.js';

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

const getBookingSettings = async (transaction) => {
  const snapshot = await transaction.get(db().doc('settings/booking'));
  const settings = snapshot.data() || {};
  return {
    appointmentBufferMinutes: Math.max(0, Number(settings.appointmentBufferMinutes || 0)),
    workingHours: Array.isArray(settings.workingHours) && settings.workingHours.length > 0
      ? settings.workingHours
      : DEFAULT_WORKING_HOURS,
  };
};

const getDayAppointments = async (transaction, date) => {
  const snapshot = await transaction.get(db().collection('appointments').where('date', '==', date));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

const getCustomerAppointments = async (transaction, customerId) => {
  const snapshot = await transaction.get(
    db().collection('appointments').where('customerId', '==', customerId),
  );
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

const rejectConflict = (conflict) => {
  if (!conflict) return;
  throw new HttpsError('already-exists', 'This appointment overlaps another appointment.', {
    code: 'appointment/conflict',
    conflictingAppointmentId: conflict.id,
  });
};

const rejectSchedule = (appointment, workingHours) => {
  const code = getScheduleRejectionCode(appointment, workingHours);
  if (!code) return;
  throw new HttpsError('failed-precondition', 'The requested appointment is outside availability.', {
    code,
  });
};

const activeAppointmentDetails = (appointment) => ({
  id: appointment.id,
  date: appointment.date || '',
  startTime: appointment.startTime || appointment.time || '',
  serviceName: appointment.serviceName || appointment.service_name || '',
  status: appointment.status || '',
});

const validateCustomer = (snapshot, auth) => {
  const customer = snapshot.data();
  if (
    !snapshot.exists
    || customer?.role !== 'customer'
    || customer?.uid !== auth.uid
    || customer?.phoneNumber !== auth.token.phone_number
  ) {
    throw new HttpsError('failed-precondition', 'A valid customer profile is required.', {
      code: 'customer/profile-missing',
    });
  }
  if (isCustomerBlocked(customer)) {
    throw new HttpsError('permission-denied', 'Customer is blocked from booking.', {
      code: 'customer/blocked',
      blockedReason: text(customer.blockedReason),
    });
  }
  return customer;
};

const validateServiceAndBarber = (serviceSnapshot, barberSnapshot) => {
  const service = serviceSnapshot.data();
  const barber = barberSnapshot.data();
  if (!serviceSnapshot.exists || service?.active !== true) {
    throw new HttpsError('failed-precondition', 'The selected service is not active.', {
      code: 'service/not-active',
    });
  }
  if (!barberSnapshot.exists || barber?.active !== true || barber?.archived === true) {
    throw new HttpsError('failed-precondition', 'The selected barber is not active.', {
      code: 'barber/not-active',
    });
  }
  return { service, barber };
};

const buildCustomerAppointment = (requested, customer, service, barber, customerId) =>
  normalizeAppointment({
    ...requested,
    customerName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
    customerPhone: customer.phoneNumber,
    serviceName: service.name,
    servicePrice: service.price,
    serviceDuration: service.duration,
    barberName: barber.name,
  }, customerId, 'pending');

export const createCustomerAppointment = onCall(async (request) => {
  const auth = requireCustomer(request);
  const requested = normalizeAppointment(request.data, auth.uid, 'pending');
  const ref = db().collection('appointments').doc();

  await db().runTransaction(async (transaction) => {
    const bookingLockRef = db().doc(`customerBookingLocks/${auth.uid}`);
    const serviceSnapshot = await transaction.get(db().doc(`services/${requested.serviceId}`));
    const barberSnapshot = await transaction.get(db().doc(`barbers/${requested.barberId}`));
    const customerSnapshot = await transaction.get(db().doc(`users/${auth.uid}`));
    await transaction.get(bookingLockRef);
    const { service, barber } = validateServiceAndBarber(serviceSnapshot, barberSnapshot);
    const customer = validateCustomer(customerSnapshot, auth);
    const appointment = buildCustomerAppointment(requested, customer, service, barber, auth.uid);
    const settings = await getBookingSettings(transaction);
    const appointments = await getDayAppointments(transaction, appointment.date);
    const customerAppointments = await getCustomerAppointments(transaction, auth.uid);
    const activeAppointment = findActiveCustomerAppointment(customerAppointments);

    if (activeAppointment) {
      throw new HttpsError('failed-precondition', 'Customer already has an active appointment.', {
        code: 'appointment/active-limit',
        activeAppointmentId: activeAppointment.id,
        activeAppointment: activeAppointmentDetails(activeAppointment),
      });
    }

    rejectSchedule(appointment, settings.workingHours);
    rejectConflict(findConflict(
      appointment,
      appointments,
      settings.appointmentBufferMinutes,
    ));
    transaction.set(ref, {
      ...appointment,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(bookingLockRef, {
      customerId: auth.uid,
      appointmentId: ref.id,
      status: 'pending',
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { id: ref.id };
});

export const replaceCustomerAppointment = onCall(async (request) => {
  const auth = requireCustomer(request);
  const activeAppointmentId = text(request.data?.activeAppointmentId);
  if (!activeAppointmentId) {
    throw new HttpsError('invalid-argument', 'activeAppointmentId is required.');
  }

  const requested = normalizeAppointment(request.data?.appointment || {}, auth.uid, 'pending');
  const replacementRef = db().collection('appointments').doc();

  await db().runTransaction(async (transaction) => {
    const existingRef = db().doc(`appointments/${activeAppointmentId}`);
    const bookingLockRef = db().doc(`customerBookingLocks/${auth.uid}`);
    const existingSnapshot = await transaction.get(existingRef);
    const serviceSnapshot = await transaction.get(db().doc(`services/${requested.serviceId}`));
    const barberSnapshot = await transaction.get(db().doc(`barbers/${requested.barberId}`));
    const customerSnapshot = await transaction.get(db().doc(`users/${auth.uid}`));
    await transaction.get(bookingLockRef);

    if (!existingSnapshot.exists || existingSnapshot.data()?.customerId !== auth.uid) {
      throw new HttpsError('not-found', 'Active appointment not found.', {
        code: 'appointment/active-not-found',
      });
    }
    const existing = { id: existingSnapshot.id, ...existingSnapshot.data() };
    if (!ACTIVE_APPOINTMENT_STATUSES.has(existing.status)) {
      throw new HttpsError('failed-precondition', 'Only an active appointment can be replaced.', {
        code: 'appointment/not-replaceable',
      });
    }

    const { service, barber } = validateServiceAndBarber(serviceSnapshot, barberSnapshot);
    const customer = validateCustomer(customerSnapshot, auth);
    const replacement = buildCustomerAppointment(requested, customer, service, barber, auth.uid);
    const settings = await getBookingSettings(transaction);
    const appointments = await getDayAppointments(transaction, replacement.date);
    const customerAppointments = await getCustomerAppointments(transaction, auth.uid);
    const otherActive = customerAppointments.find((appointment) => (
      appointment.id !== activeAppointmentId
      && ACTIVE_APPOINTMENT_STATUSES.has(appointment.status)
    ));

    if (otherActive) {
      throw new HttpsError('failed-precondition', 'Customer has another active appointment.', {
        code: 'appointment/active-limit',
        activeAppointmentId: otherActive.id,
        activeAppointment: activeAppointmentDetails(otherActive),
      });
    }

    rejectSchedule(replacement, settings.workingHours);
    rejectConflict(findConflict(
      replacement,
      appointments,
      settings.appointmentBufferMinutes,
      activeAppointmentId,
    ));

    transaction.update(existingRef, {
      status: 'cancelled',
      cancelledAt: FieldValue.serverTimestamp(),
      cancelledBy: auth.uid,
      cancellationReason: 'customer_replaced_appointment',
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(replacementRef, {
      ...replacement,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(bookingLockRef, {
      customerId: auth.uid,
      appointmentId: replacementRef.id,
      status: 'pending',
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { id: replacementRef.id, replacedAppointmentId: activeAppointmentId };
});

export const createAdminAppointment = onCall(async (request) => {
  const auth = await requireAdmin(request);
  const appointment = normalizeAppointment(request.data, text(request.data.customerId) || auth.uid);
  const ref = db().collection('appointments').doc();

  await db().runTransaction(async (transaction) => {
    const settings = await getBookingSettings(transaction);
    const appointments = await getDayAppointments(transaction, appointment.date);
    if (BLOCKING_STATUSES.has(appointment.status)) {
      rejectConflict(findConflict(
        appointment,
        appointments,
        settings.appointmentBufferMinutes,
      ));
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
      const allowed = new Set(['date', 'startTime', 'time', 'status', 'cancellationReason']);
      const invalidKey = Object.keys(requested).find((key) => !allowed.has(key));
      if (invalidKey) {
        throw new HttpsError('permission-denied', `Customers cannot update ${invalidKey}.`);
      }
    }
    if (!adminOnly && requested.status && requested.status !== 'cancelled' && requested.status !== 'pending') {
      throw new HttpsError('permission-denied', 'Customers may only cancel or reschedule appointments.');
    }
    if (!adminOnly && requested.cancellationReason && requested.status !== 'cancelled') {
      throw new HttpsError('permission-denied', 'A cancellation reason is allowed only when cancelling.');
    }

    const merged = normalizeAppointment(
      { ...existing, ...requested },
      existing.customerId,
      requested.status || existing.status,
    );
    const settings = await getBookingSettings(transaction);
    const appointments = await getDayAppointments(transaction, merged.date);
    if (BLOCKING_STATUSES.has(merged.status)) {
      if (!adminOnly) rejectSchedule(merged, settings.workingHours);
      rejectConflict(findConflict(
        merged,
        appointments,
        settings.appointmentBufferMinutes,
        appointmentId,
      ));
    }

    const cancellation = requested.status === 'cancelled'
      ? {
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledBy: auth.uid,
        cancellationReason: text(requested.cancellationReason)
          || (adminOnly ? 'admin_cancelled' : 'customer_cancelled'),
      }
      : {};
    transaction.update(ref, {
      ...merged,
      ...cancellation,
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
