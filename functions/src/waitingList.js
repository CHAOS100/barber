import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { buildWaitingListManualSmsJob } from './notifications/notificationJobs.js';
import { NotificationJobService } from './notifications/notificationService.js';
import { sendSmsNotificationJob } from './notifications/smsProvider.js';
import { requirePhoneCustomerAuth } from './auth.js';
import {
  addMinutes,
  DEFAULT_WORKING_HOURS,
  findConflict,
  getScheduleRejectionCode,
  getWorkingHoursForDate,
} from './scheduling.js';

const ALLOWED_ORIGINS = new Set([
  'https://barber-sigma-five.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]);

const db = () => getFirestore();
const notificationJobs = () => new NotificationJobService(getFirestore());
const text = (value) => String(value || '').trim();
const hasNumberValue = (value) => value !== undefined && value !== null && value !== '';
const activeWaitingListStatuses = new Set(['active', 'notified']);
const preferenceTypes = new Set(['exact_time', 'time_range', 'day_part', 'whole_day']);

const isValidIsraeliPhone = (phone) => {
  const value = text(phone).replace(/[^\d+]/g, '');
  return /^05\d{8}$/.test(value)
    || /^9725\d{8}$/.test(value)
    || /^\+9725\d{8}$/.test(value);
};

const buildManualInAppNotification = (waitingListId, entry) => {
  const requestedTime = entry.exactTime
    || entry.availableStartTime
    || entry.startTime
    || '';

  return {
    type: 'free_slot',
    severity: 'success',
    title: 'התפנה תור מתאים',
    message: requestedTime
      ? `התפנה תור ב־OST BARBER בתאריך ${entry.date} בשעה ${requestedTime}. היכנס לאפליקציה כדי לקבוע לפני שמישהו אחר יתפוס.`
      : `ייתכן שהתפנה תור ב־OST BARBER בתאריך ${entry.date}. היכנס לאפליקציה כדי לבדוק זמינות.`,
    targetType: 'single_customer',
    targetCustomerId: entry.customerId || null,
    targetPhone: entry.phoneNumber || null,
    status: 'unread',
    source: 'waiting_list_manual',
    appointmentId: entry.availableAppointmentId || null,
    waitingListId,
    waitingListEntryId: waitingListId,
    date: entry.date || null,
    startTime: requestedTime || null,
    availableStartTime: requestedTime || null,
    serviceId: entry.serviceId || null,
    serviceName: entry.serviceName || null,
    barberId: entry.barberId || null,
    barberName: entry.barberName || null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    expiresAt: null,
  };
};

const setCorsHeaders = (request, response) => {
  const origin = request.get('origin') || '';
  if (ALLOWED_ORIGINS.has(origin)) {
    response.set('Access-Control-Allow-Origin', origin);
    response.set('Vary', 'Origin');
  }
  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const sendJson = (response, status, payload) => {
  response.status(status).json(payload);
};

const cleanError = (code, message, status = 400) => ({ code, message, status });

const optionalText = (value) => {
  const cleaned = text(value);
  return cleaned || null;
};

const getBookingSettings = async (transaction) => {
  const bookingSnapshot = await transaction.get(db().doc('settings/booking'));
  const settings = bookingSnapshot.data() || {};
  const legacyBuffer = Math.max(
    0,
    Number(
      settings.appointmentBufferMinutes
      ?? settings.defaultAppointmentBufferAfterMinutes
      ?? settings.defaultAppointmentBufferBeforeMinutes
      ?? 0,
    ) || 0,
  );
  return {
    defaultAppointmentBufferBeforeMinutes: 0,
    defaultAppointmentBufferAfterMinutes: legacyBuffer,
    workingHours: Array.isArray(settings.workingHours) && settings.workingHours.length > 0
      ? settings.workingHours
      : DEFAULT_WORKING_HOURS,
  };
};

const normalizeCreateWaitingListInput = (input) => {
  const preferenceType = text(input?.preferenceType || 'whole_day');
  if (!preferenceTypes.has(preferenceType)) {
    throw new HttpsError('invalid-argument', 'Invalid waiting list preference type.', {
      code: 'waiting-list/invalid-preference',
    });
  }

  const date = text(input?.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpsError('invalid-argument', 'Waiting list date is invalid.', {
      code: 'waiting-list/invalid-date',
    });
  }

  const exactTime = preferenceType === 'exact_time' ? text(input?.exactTime) : '';
  const startTime = preferenceType === 'time_range' ? text(input?.startTime) : '';
  const endTime = preferenceType === 'time_range' ? text(input?.endTime) : '';
  const dayPart = preferenceType === 'day_part' ? text(input?.dayPart) : '';

  if (preferenceType === 'exact_time' && !/^\d{2}:\d{2}$/.test(exactTime)) {
    throw new HttpsError('invalid-argument', 'Exact time is invalid.', {
      code: 'waiting-list/invalid-time',
    });
  }
  if (
    preferenceType === 'time_range'
    && (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || startTime >= endTime)
  ) {
    throw new HttpsError('invalid-argument', 'Time range is invalid.', {
      code: 'waiting-list/invalid-time-range',
    });
  }
  if (preferenceType === 'day_part' && !['morning', 'noon', 'evening'].includes(dayPart)) {
    throw new HttpsError('invalid-argument', 'Day part is invalid.', {
      code: 'waiting-list/invalid-day-part',
    });
  }

  return {
    date,
    preferenceType,
    exactTime,
    startTime,
    endTime,
    dayPart,
    serviceId: optionalText(input?.serviceId),
    serviceName: optionalText(input?.serviceName),
    barberId: optionalText(input?.barberId),
    barberName: optionalText(input?.barberName),
    expiresAt: input?.expiresAt || null,
  };
};

const assertNoActiveWaitingListEntry = async (transaction, customerId) => {
  const snapshot = await transaction.get(
    db().collection('waitingList').where('customerId', '==', customerId),
  );
  const existingActive = snapshot.docs.find((item) =>
    activeWaitingListStatuses.has(item.data()?.status));

  if (existingActive) {
    throw new HttpsError('failed-precondition', 'Customer already has an active waiting list entry.', {
      code: 'waiting-list/active-limit',
      waitingListId: existingActive.id,
    });
  }
};

const assertExactSlotIsUnavailable = async (transaction, input) => {
  if (input.preferenceType !== 'exact_time' || !input.serviceId || !input.barberId) return;

  const serviceSnapshot = await transaction.get(db().doc(`services/${input.serviceId}`));
  const barberSnapshot = await transaction.get(db().doc(`barbers/${input.barberId}`));
  const service = serviceSnapshot.data();
  const barber = barberSnapshot.data();
  if (!serviceSnapshot.exists || service?.active !== true) return;
  if (!barberSnapshot.exists || barber?.active !== true || barber?.archived === true) return;

  const settings = await getBookingSettings(transaction);
  const serviceDuration = Math.max(1, Number(service.duration || 30));
  const candidate = {
    date: input.date,
    startTime: input.exactTime,
    endTime: addMinutes(input.exactTime, serviceDuration),
    barberId: input.barberId,
    serviceId: input.serviceId,
    serviceDuration,
    status: 'pending',
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: Math.max(0, Number(settings.defaultAppointmentBufferAfterMinutes || 0)),
  };

  const scheduleCode = getScheduleRejectionCode(candidate, settings.workingHours);
  if (scheduleCode) return;

  const appointmentsSnapshot = await transaction.get(
    db().collection('appointments').where('date', '==', input.date),
  );
  const appointments = appointmentsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  const conflict = findConflict(candidate, appointments, {
    defaultBufferBeforeMinutes: settings.defaultAppointmentBufferBeforeMinutes,
    defaultBufferAfterMinutes: settings.defaultAppointmentBufferAfterMinutes,
  });

  if (!conflict) {
    throw new HttpsError('failed-precondition', 'Requested slot is currently available.', {
      code: 'waiting-list/slot-available',
    });
  }
};

const readBearerToken = (request) => {
  const authorization = request.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
};

const requireAdminFromBearerToken = async (request) => {
  const token = readBearerToken(request);
  if (!token) {
    throw cleanError('unauthenticated', 'Authentication is required.', 401);
  }

  let decodedToken;
  try {
    decodedToken = await getAuth().verifyIdToken(token);
  } catch (error) {
    logger.warn('manualNotifyWaitingListEntry token verification failed', {
      code: error?.code || 'unknown',
    });
    throw cleanError('unauthenticated', 'Authentication is required.', 401);
  }

  const adminSnapshot = await db().doc(`admins/${decodedToken.uid}`).get();
  const admin = adminSnapshot.data();
  if (!adminSnapshot.exists || admin?.role !== 'admin' || admin?.active !== true) {
    throw cleanError('permission-denied', 'Active admin access is required.', 403);
  }

  return { uid: decodedToken.uid };
};

export const createCustomerWaitingListEntry = onCall(async (request) => {
  const auth = await requirePhoneCustomerAuth(request);
  const input = normalizeCreateWaitingListInput(request.data || {});
  const ref = db().collection('waitingList').doc();

  await db().runTransaction(async (transaction) => {
    const customerSnapshot = await transaction.get(db().doc(`users/${auth.uid}`));
    const customer = customerSnapshot.data();
    if (
      !customerSnapshot.exists
      || customer?.role !== 'customer'
      || customer?.uid !== auth.uid
      || customer?.phoneNumber !== auth.phoneNumber
    ) {
      throw new HttpsError('failed-precondition', 'A valid customer profile is required.', {
        code: 'customer/profile-missing',
      });
    }

    await assertNoActiveWaitingListEntry(transaction, auth.uid);
    await assertExactSlotIsUnavailable(transaction, input);

    const customerName = text(customer.name)
      || text(`${customer.firstName || ''} ${customer.lastName || ''}`);

    transaction.set(ref, {
      customerId: auth.uid,
      customerName,
      phoneNumber: customer.phoneNumber,
      date: input.date,
      preferenceType: input.preferenceType,
      exactTime: input.preferenceType === 'exact_time' ? input.exactTime : null,
      startTime: input.preferenceType === 'time_range' ? input.startTime : null,
      endTime: input.preferenceType === 'time_range' ? input.endTime : null,
      dayPart: input.preferenceType === 'day_part' ? input.dayPart : null,
      serviceId: input.serviceId,
      serviceName: input.serviceName,
      barberId: input.barberId,
      barberName: input.barberName,
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      notifiedAt: null,
      expiresAt: input.expiresAt,
    });
  });

  return { id: ref.id };
});

const handleManualNotify = async (request) => {
  const auth = await requireAdminFromBearerToken(request);
  const waitingListId = text(request.body?.waitingListId);
  if (!waitingListId) {
    throw cleanError('invalid-argument', 'waitingListId is required.', 400);
  }

  const reference = db().doc(`waitingList/${waitingListId}`);
  const snapshot = await reference.get();
  if (!snapshot.exists) {
    throw cleanError('not-found', 'Waiting list entry not found.', 404);
  }

  const entry = { id: snapshot.id, ...snapshot.data() };
  if (!entry.phoneNumber) {
    throw cleanError('failed-precondition', 'Waiting list entry has no customer phone.', 400);
  }
  if (!isValidIsraeliPhone(entry.phoneNumber)) {
    throw cleanError('failed-precondition', 'Waiting list entry has invalid customer phone.', 400);
  }

  const notificationJob = buildWaitingListManualSmsJob(waitingListId, entry);
  const smsResult = await sendSmsNotificationJob(notificationJob.data);
  const notificationJobForStorage = {
    ...notificationJob,
    data: {
      ...notificationJob.data,
      provider: smsResult.provider || null,
      providerConfigured: smsResult.providerConfigured === true,
      providerMessageId: smsResult.providerMessageId || null,
      status: smsResult.sent ? 'sent' : 'pending',
      sentAt: smsResult.sent ? FieldValue.serverTimestamp() : null,
      error: smsResult.sent ? null : (smsResult.reason || smsResult.error || null),
    },
  };

  await notificationJobs().enqueue([notificationJobForStorage]);

  if (entry.customerId) {
    await db()
      .collection('customerNotifications')
      .doc(entry.customerId)
      .collection('notifications')
      .add(buildManualInAppNotification(waitingListId, entry));
  }

  if (smsResult.providerConfigured === true && smsResult.sent !== true) {
    await reference.update({
      lastNotificationError: 'sms-send-failed',
      smsProviderConfigured: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw cleanError('sms/send-failed', 'SMS provider failed to send the message.', 502);
  }

  await reference.update({
    status: 'notified',
    notifiedAt: FieldValue.serverTimestamp(),
    manuallyNotifiedAt: FieldValue.serverTimestamp(),
    manuallyNotifiedBy: auth.uid,
    smsProviderConfigured: smsResult.providerConfigured === true,
    smsSent: smsResult.sent === true,
    smsProvider: smsResult.provider || null,
    smsProviderMessageId: smsResult.providerMessageId || null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const providerConfigured = smsResult.providerConfigured === true;
  return {
    ok: true,
    id: waitingListId,
    status: smsResult.sent ? 'sent' : 'queued',
    notificationJobCreated: true,
    smsProviderConfigured: providerConfigured,
    smsSent: smsResult.sent === true,
    provider: smsResult.provider || null,
    message: providerConfigured
      ? 'Notification job created and SMS sent.'
      : 'Notification job created, but real SMS provider is not configured yet.',
  };
};

export const manualNotifyWaitingListEntry = onRequest(async (request, response) => {
  setCorsHeaders(request, response);

  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return;
  }

  const origin = request.get('origin') || '';
  if (!ALLOWED_ORIGINS.has(origin)) {
    sendJson(response, 403, {
      ok: false,
      error: {
        code: 'cors/origin-not-allowed',
        message: 'Origin is not allowed.',
      },
    });
    return;
  }

  if (request.method !== 'POST') {
    sendJson(response, 405, {
      ok: false,
      error: {
        code: 'method-not-allowed',
        message: 'Only POST is allowed.',
      },
    });
    return;
  }

  try {
    const result = await handleManualNotify(request);
    sendJson(response, 200, result);
  } catch (error) {
    const status = Number(error?.status || 500);
    const code = error?.code || 'internal';
    const message = status >= 500
      ? 'Temporary server error.'
      : error?.message || 'Request failed.';

    logger.error('manualNotifyWaitingListEntry failed', {
      code,
      status,
      message: error?.message || 'Unknown error',
    });

    sendJson(response, status, {
      ok: false,
      error: { code, message },
    });
  }
});
