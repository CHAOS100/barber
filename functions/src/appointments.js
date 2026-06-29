import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  addMinutes,
  BLOCKING_STATUSES,
  DEFAULT_WORKING_HOURS,
  findConflict,
  getWorkingHoursForDate,
  getScheduleRejectionCode,
  timeToMinutes,
} from './scheduling.js';
import {
  findActiveCustomerAppointment,
  hasActivePaymentRequest,
  isActiveCustomerAppointment,
  isCustomerBlocked,
} from './bookingPolicy.js';
import { requireCallableAuth, requirePhoneCustomerAuth } from './auth.js';

const db = () => getFirestore();

const requireAuth = requireCallableAuth;

const requireCustomer = (request) => requirePhoneCustomerAuth(request);

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
const hasNumberValue = (value) => value !== undefined && value !== null && value !== '';

const normalizeIsraeliPhoneNumber = (value) => {
  let normalized = text(value)
    .replace(/[\u200E\u200F\u202A-\u202E]/g, '')
    .replace(/[^\d+]/g, '');

  if (normalized.endsWith('+') && !normalized.startsWith('+')) {
    normalized = `+${normalized.slice(0, -1)}`;
  }
  if (/^05\d{8}$/.test(normalized)) return `+972${normalized.slice(1)}`;
  if (/^5\d{8}$/.test(normalized)) return `+972${normalized}`;
  if (/^9725\d{8}$/.test(normalized)) return `+${normalized}`;
  if (/^\+9725\d{8}$/.test(normalized)) return normalized;

  throw new HttpsError('invalid-argument', 'Customer phone number is invalid.', {
    code: 'customer/invalid-phone',
  });
};

const customerDisplayName = (customer) => text(
  customer?.name
  || `${customer?.firstName || ''} ${customer?.lastName || ''}`,
);

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
    customerId: customerId || null,
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
    bufferBeforeMinutes: input.bufferBeforeMinutes !== undefined ? Math.max(0, Number(input.bufferBeforeMinutes) || 0) : null,
    bufferAfterMinutes: input.bufferAfterMinutes !== undefined ? Math.max(0, Number(input.bufferAfterMinutes) || 0) : null,
    notes: text(input.notes),
    adminNotes: text(input.adminNotes || input.admin_notes),
  };
};

const getBookingSettings = async (transaction) => {
  const bookingSnapshot = await transaction.get(db().doc('settings/booking'));
  const businessSnapshot = await transaction.get(db().doc('settings/business'));
  const settings = bookingSnapshot.data() || {};
  const businessSettings = businessSnapshot.data() || {};
  const legacyBuffer = Math.max(
    0,
    Number(
      settings.appointmentBufferMinutes
      ?? settings.defaultAppointmentBufferAfterMinutes
      ?? settings.defaultAppointmentBufferBeforeMinutes
      ?? businessSettings.defaultAppointmentBufferAfterMinutes
      ?? businessSettings.defaultAppointmentBufferBeforeMinutes
      ?? 0,
    ) || 0,
  );
  return {
    appointmentBufferMinutes: legacyBuffer,
    defaultAppointmentBufferBeforeMinutes: 0,
    defaultAppointmentBufferAfterMinutes: legacyBuffer,
    visibleSlotIntervalMinutes: Math.max(
      1,
      Number(settings.visibleSlotIntervalMinutes || businessSettings.visibleSlotIntervalMinutes || 30),
    ),
    cancellationDeadlineMinutesBeforeAppointment: Math.max(
      0,
      Number(
        businessSettings.cancellationDeadlineMinutesBeforeAppointment
        ?? settings.cancellationDeadlineMinutesBeforeAppointment
        ?? 180,
      ),
    ),
    bookingPolicyText: text(businessSettings.bookingPolicyText),
    bookingPolicyVersion: text(businessSettings.bookingPolicyVersion) || '2026-06-16',
    workingHours: Array.isArray(settings.workingHours) && settings.workingHours.length > 0
      ? settings.workingHours
      : DEFAULT_WORKING_HOURS,
    availabilityMode: settings.availabilityMode === 'manual' ? 'manual' : 'automatic',
  };
};

const applyResolvedBuffers = (appointment, service, settings) => ({
  ...appointment,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: Math.max(0, Number(settings.defaultAppointmentBufferAfterMinutes || 0)),
});

const conflictSettings = (settings) => ({
  defaultBufferBeforeMinutes: settings.defaultAppointmentBufferBeforeMinutes,
  defaultBufferAfterMinutes: settings.defaultAppointmentBufferAfterMinutes,
});

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

const dayPartForTime = (time) => {
  const [hour] = String(time || '').split(':').map(Number);
  if (hour < 12) return 'morning';
  if (hour < 16) return 'noon';
  return 'evening';
};

const waitingListMatchesAppointment = (entry, appointment) => {
  if (!['active', 'notified'].includes(entry.status)) return false;
  if (entry.date !== appointment.date) return false;
  // barberId must match if the entry specifies one
  if (entry.barberId && entry.barberId !== appointment.barberId) return false;
  if (entry.serviceId && entry.serviceId !== appointment.serviceId) return false;
  if (entry.preferenceType === 'exact_time') return entry.exactTime === appointment.startTime;
  if (entry.preferenceType === 'time_range') {
    return (!entry.startTime || appointment.startTime >= entry.startTime)
      && (!entry.endTime || appointment.startTime <= entry.endTime);
  }
  if (entry.preferenceType === 'day_part') {
    return entry.dayPart === dayPartForTime(appointment.startTime);
  }
  return entry.preferenceType === 'whole_day';
};

const markMatchingWaitingListBooked = async (transaction, customerId, appointmentId, appointment) => {
  const snapshot = await transaction.get(
    db().collection('waitingList').where('customerId', '==', customerId),
  );

  snapshot.docs.forEach((item) => {
    const entry = item.data();
    if (!waitingListMatchesAppointment(entry, appointment)) return;
    transaction.update(item.ref, {
      status: 'booked',
      bookedAppointmentId: appointmentId,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
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

const getProfilesByPhone = (transaction, phoneNumber) =>
  transaction.get(db().collection('users').where('phoneNumber', '==', phoneNumber).limit(2));

const resolveAdminAppointmentCustomer = async (transaction, input) => {
  const explicitCustomerId = text(input.customerId || input.customer_id);
  const inputName = text(input.customerName || input.customer_name);
  const rawPhone = text(input.customerPhone || input.customer_phone);

  if (explicitCustomerId) {
    const customerSnapshot = await transaction.get(db().doc(`users/${explicitCustomerId}`));
    const customer = customerSnapshot.data();
    if (!customerSnapshot.exists || customer?.role !== 'customer') {
      throw new HttpsError('failed-precondition', 'Selected customer was not found.', {
        code: 'customer/not-found',
      });
    }
    return {
      customerId: customerSnapshot.id,
      customerName: customerDisplayName(customer) || inputName,
      customerPhone: normalizeIsraeliPhoneNumber(customer.phoneNumber || rawPhone),
      customerRegistered: true,
    };
  }

  if (!rawPhone) {
    throw new HttpsError('invalid-argument', 'Customer phone number is required.', {
      code: 'customer/phone-required',
    });
  }

  const normalizedPhone = normalizeIsraeliPhoneNumber(rawPhone);
  const matches = await getProfilesByPhone(transaction, normalizedPhone);
  if (matches.size > 1) {
    throw new HttpsError('failed-precondition', 'Duplicate customer profiles exist for this phone number.', {
      code: 'customer/duplicate-phone',
    });
  }

  if (!matches.empty) {
    const customerSnapshot = matches.docs[0];
    const customer = customerSnapshot.data();
    return {
      customerId: customerSnapshot.id,
      customerName: customerDisplayName(customer) || inputName,
      customerPhone: normalizedPhone,
      customerRegistered: true,
    };
  }

  return {
    customerId: null,
    customerName: inputName || normalizedPhone,
    customerPhone: normalizedPhone,
    customerRegistered: false,
  };
};

const applyAdminCustomerFields = (input, resolvedCustomer) => ({
  ...input,
  customerId: resolvedCustomer.customerId,
  customerName: resolvedCustomer.customerName,
  customerPhone: resolvedCustomer.customerPhone,
});

const getIsraelNowLocalMinutes = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  const dayNumber = Math.floor(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86400000);
  return (dayNumber * 1440) + (Number(parts.hour) * 60) + Number(parts.minute);
};

const getAppointmentLocalMinutes = (appointment) => {
  const [year, month, day] = String(appointment.date || '').split('-').map(Number);
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / 86400000);
  return (dayNumber * 1440) + timeToMinutes(appointment.startTime || appointment.time);
};

const enforceCustomerCancellationDeadline = (appointment, settings) => {
  const deadline = Math.max(0, Number(settings.cancellationDeadlineMinutesBeforeAppointment || 0));
  const minutesUntilAppointment = getAppointmentLocalMinutes(appointment) - getIsraelNowLocalMinutes();
  if (minutesUntilAppointment < deadline) {
    throw new HttpsError('failed-precondition', 'Cancellation deadline has passed.', {
      code: 'appointment/cancellation-deadline-passed',
      cancellationDeadlineMinutesBeforeAppointment: deadline,
    });
  }
};

const normalizeNoShowAction = (value) => {
  const action = text(value);
  return ['block', 'payment_required', 'warning'].includes(action) ? action : 'warning';
};

const validateCustomer = (snapshot, auth) => {
  const customer = snapshot.data();
  if (
    !snapshot.exists
    || customer?.role !== 'customer'
    || customer?.uid !== auth.uid
    || customer?.phoneNumber !== auth.phoneNumber
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
  if (hasActivePaymentRequest(customer)) {
    throw new HttpsError('permission-denied', 'Customer has an active payment request.', {
      code: 'customer/payment-required',
      noShowPaymentAmount: Number(customer.noShowPaymentAmount || 0),
      noShowPaymentReason: text(customer.noShowPaymentReason),
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

const rejectManualModeSlot = async (transaction, appointment) => {
  const releasesSnapshot = await transaction.get(
    db().collection('bookingSlotReleases').where('date', '==', appointment.date),
  );
  const activeReleases = releasesSnapshot.docs
    .map((item) => item.data())
    .filter((r) => r.barberId === appointment.barberId && r.status === 'active');
  const slotMinutes = timeToMinutes(appointment.startTime);
  const endMinutes = timeToMinutes(appointment.endTime);
  const isReleased = activeReleases.some((r) => {
    const from = timeToMinutes(r.startTime);
    const to = timeToMinutes(r.endTime);
    return slotMinutes >= from && endMinutes <= to;
  });
  if (!isReleased) {
    throw new HttpsError('failed-precondition', 'This time slot has not been released for booking.', {
      code: 'appointment/slot-not-released',
    });
  }
};

export const createCustomerAppointment = onCall(async (request) => {
  const auth = await requireCustomer(request);
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
    const settings = await getBookingSettings(transaction);
    if (request.data?.policyAccepted !== true) {
      throw new HttpsError('failed-precondition', 'Booking policy must be accepted.', {
        code: 'appointment/policy-not-accepted',
      });
    }
    const appointment = applyResolvedBuffers(
      buildCustomerAppointment(requested, customer, service, barber, auth.uid),
      service,
      settings,
    );
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
    if (settings.availabilityMode === 'manual') {
      await rejectManualModeSlot(transaction, appointment);
    }
    rejectConflict(findConflict(
      appointment,
      appointments,
      conflictSettings(settings),
    ));
    await markMatchingWaitingListBooked(transaction, auth.uid, ref.id, appointment);
    transaction.set(ref, {
      ...appointment,
      policyAcceptedAt: FieldValue.serverTimestamp(),
      policyVersion: settings.bookingPolicyVersion,
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
  const auth = await requireCustomer(request);
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
    if (!isActiveCustomerAppointment(existing)) {
      throw new HttpsError('failed-precondition', 'Only an active appointment can be replaced.', {
        code: 'appointment/not-replaceable',
      });
    }

    const settings = await getBookingSettings(transaction);
    if (request.data?.appointment?.policyAccepted !== true) {
      throw new HttpsError('failed-precondition', 'Booking policy must be accepted.', {
        code: 'appointment/policy-not-accepted',
      });
    }
    const { service, barber } = validateServiceAndBarber(serviceSnapshot, barberSnapshot);
    const customer = validateCustomer(customerSnapshot, auth);
    const replacement = applyResolvedBuffers(
      buildCustomerAppointment(requested, customer, service, barber, auth.uid),
      service,
      settings,
    );
    const appointments = await getDayAppointments(transaction, replacement.date);
    const customerAppointments = await getCustomerAppointments(transaction, auth.uid);
    const otherActive = customerAppointments.find((appointment) => (
      appointment.id !== activeAppointmentId
      && isActiveCustomerAppointment(appointment)
    ));

    if (otherActive) {
      throw new HttpsError('failed-precondition', 'Customer has another active appointment.', {
        code: 'appointment/active-limit',
        activeAppointmentId: otherActive.id,
        activeAppointment: activeAppointmentDetails(otherActive),
      });
    }

    rejectSchedule(replacement, settings.workingHours);
    if (settings.availabilityMode === 'manual') {
      await rejectManualModeSlot(transaction, replacement);
    }
    rejectConflict(findConflict(
      replacement,
      appointments,
      conflictSettings(settings),
      activeAppointmentId,
    ));

    await markMatchingWaitingListBooked(transaction, auth.uid, replacementRef.id, replacement);
    transaction.update(existingRef, {
      status: 'cancelled',
      cancelledAt: FieldValue.serverTimestamp(),
      cancelledBy: auth.uid,
      cancellationReason: 'customer_replaced_appointment',
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(replacementRef, {
      ...replacement,
      policyAcceptedAt: FieldValue.serverTimestamp(),
      policyVersion: settings.bookingPolicyVersion,
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
  const ref = db().collection('appointments').doc();

  await db().runTransaction(async (transaction) => {
    const resolvedCustomer = await resolveAdminAppointmentCustomer(transaction, request.data || {});
    const requestedAppointment = normalizeAppointment(
      applyAdminCustomerFields(request.data || {}, resolvedCustomer),
      resolvedCustomer.customerId,
    );
    const settings = await getBookingSettings(transaction);
    const serviceSnapshot = requestedAppointment.serviceId
      ? await transaction.get(db().doc(`services/${requestedAppointment.serviceId}`))
      : null;
    const appointment = applyResolvedBuffers(
      requestedAppointment,
      serviceSnapshot?.data?.() || {},
      settings,
    );
    const appointments = await getDayAppointments(transaction, appointment.date);
    if (BLOCKING_STATUSES.has(appointment.status)) {
      rejectConflict(findConflict(
        appointment,
        appointments,
        conflictSettings(settings),
      ));
    }
    transaction.set(ref, {
      ...appointment,
      customerRegistered: resolvedCustomer.customerRegistered,
      source: 'admin',
      createdBy: auth.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { id: ref.id };
});

const updateAppointment = async (request, adminOnly) => {
  const auth = adminOnly ? await requireAdmin(request) : await requireCustomer(request);
  const appointmentId = text(request.data.appointmentId);
  if (!appointmentId) throw new HttpsError('invalid-argument', 'appointmentId is required.');

  const ref = db().doc(`appointments/${appointmentId}`);
  await db().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Appointment not found.');
    const existing = snapshot.data();
    const customerOwnsByPhone = !adminOnly
      && text(existing.customerPhone) === auth.phoneNumber;
    if (!adminOnly && existing.customerId !== auth.uid && !customerOwnsByPhone) {
      throw new HttpsError('permission-denied', 'Customers may only update their own appointments.');
    }

    let requested = request.data.changes || {};
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

    const hasAdminCustomerChange = adminOnly && Object.keys(requested).some((key) => [
      'customerId',
      'customer_id',
      'customerName',
      'customer_name',
      'customerPhone',
      'customer_phone',
    ].includes(key));
    const resolvedAdminCustomer = hasAdminCustomerChange
      ? await resolveAdminAppointmentCustomer(transaction, { ...existing, ...requested })
      : null;

    if (resolvedAdminCustomer) {
      requested = applyAdminCustomerFields(requested, resolvedAdminCustomer);
    }

    const normalizedMerged = normalizeAppointment(
      { ...existing, ...requested },
      Object.prototype.hasOwnProperty.call(requested, 'customerId')
        ? requested.customerId
        : (!adminOnly && !existing.customerId && customerOwnsByPhone ? auth.uid : existing.customerId),
      requested.status || existing.status,
    );
    const settings = await getBookingSettings(transaction);
    const serviceSnapshot = normalizedMerged.serviceId
      ? await transaction.get(db().doc(`services/${normalizedMerged.serviceId}`))
      : null;
    const merged = applyResolvedBuffers(
      normalizedMerged,
      serviceSnapshot?.data?.() || {},
      settings,
    );

    if (!adminOnly && requested.status === 'cancelled') {
      enforceCustomerCancellationDeadline(merged, settings);
    }

    const appointments = await getDayAppointments(transaction, merged.date);
    if (BLOCKING_STATUSES.has(merged.status)) {
      if (!adminOnly) rejectSchedule(merged, settings.workingHours);
      rejectConflict(findConflict(
        merged,
        appointments,
        conflictSettings(settings),
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
    const noShowAction = adminOnly && requested.status === 'no_show'
      ? normalizeNoShowAction(requested.noShowAction)
      : '';
    const noShow = noShowAction
      ? {
        noShowAt: FieldValue.serverTimestamp(),
        markedNoShowBy: auth.uid,
        noShowAction,
      }
      : {};
    const noShowCustomerRef = noShowAction && merged.customerId
      ? db().doc(`users/${merged.customerId}`)
      : null;
    const noShowCustomerSnapshot = noShowCustomerRef
      ? await transaction.get(noShowCustomerRef)
      : null;
    transaction.update(ref, {
      ...merged,
      ...(resolvedAdminCustomer ? { customerRegistered: resolvedAdminCustomer.customerRegistered } : {}),
      ...cancellation,
      ...noShow,
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (noShowAction && noShowCustomerRef && noShowCustomerSnapshot?.exists) {
      const noShowReason = 'אי הגעה לתור';
      if (noShowAction === 'block') {
        transaction.update(noShowCustomerRef, {
          blocked: true,
          blockedReason: 'החשבון שלך נחסם לקביעת תורים עקב אי הגעה לתור. להסרת החסימה פנה לעסק.',
          blockedAt: FieldValue.serverTimestamp(),
          blockedBy: auth.uid,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else if (noShowAction === 'payment_required') {
        transaction.update(noShowCustomerRef, {
          requiresNoShowPayment: true,
          noShowPaymentAmount: Math.round(Number(merged.servicePrice || 0) * 0.5),
          noShowPaymentReason: 'לפי מדיניות העסק, נדרש תשלום של 50% ממחיר התספורת עקב ביטול ללא הודעה מראש / אי הגעה.',
          relatedAppointmentId: appointmentId,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        transaction.update(noShowCustomerRef, {
          warningCount: FieldValue.increment(1),
          lastWarningReason: noShowReason,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
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

const ARCHIVABLE_STATUSES = new Set(['completed', 'cancelled', 'no_show', 'rejected']);

export const archiveAdminAppointment = onCall(async (request) => {
  const auth = await requireAdmin(request);
  const appointmentId = text(request.data.appointmentId);
  if (!appointmentId) throw new HttpsError('invalid-argument', 'appointmentId is required.');

  const ref = db().doc(`appointments/${appointmentId}`);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Appointment not found.');

  const data = snapshot.data();
  if (!ARCHIVABLE_STATUSES.has(data.status)) {
    throw new HttpsError('failed-precondition', 'Only completed, cancelled, no_show, or rejected appointments can be archived.');
  }

  await ref.update({
    archivedFromActive: true,
    archivedAt: FieldValue.serverTimestamp(),
    archivedBy: auth.uid,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: appointmentId };
});

export const batchArchiveAdminAppointments = onCall(async (request) => {
  const auth = await requireAdmin(request);

  const snapshot = await db().collection('appointments')
    .where('status', 'in', [...ARCHIVABLE_STATUSES])
    .get();

  const toArchive = snapshot.docs.filter((docSnapshot) => !docSnapshot.data().archivedFromActive);
  if (toArchive.length === 0) return { count: 0 };

  const batch = db().batch();
  const now = FieldValue.serverTimestamp();
  toArchive.forEach((docSnapshot) => {
    batch.update(docSnapshot.ref, {
      archivedFromActive: true,
      archivedAt: now,
      archivedBy: auth.uid,
      updatedAt: now,
    });
  });

  await batch.commit();
  return { count: toArchive.length };
});
