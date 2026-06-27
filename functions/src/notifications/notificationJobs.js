import { DateTime } from 'luxon';

// ── Channel constants ─────────────────────────────────────────────────────────

export const NOTIFICATION_CHANNEL = 'whatsapp';  // legacy default — kept for existing jobs
export const PUSH_CHANNEL = 'push';              // Phase 1+ business event channel
export const NOTIFICATION_STATUS = 'pending';

// ── SMS / WhatsApp guard flags ────────────────────────────────────────────────
//
// PRODUCT RULE:
//   SMS is used ONLY for Firebase Phone Auth (OTP). Never for business reminders.
//   WhatsApp business reminder sending is NOT implemented (stub only).
//   Push notifications are the supported channel for all business events.
//
// Cloud Functions read LEGACY_WHATSAPP_JOBS_ENABLED to decide whether to enqueue
// legacy WhatsApp/SMS notification jobs. Set to false to disable.
// The builder functions below are kept intact for existing tests.
//
export const LEGACY_WHATSAPP_JOBS_ENABLED = false;
export const BUSINESS_SMS_REMINDERS_ENABLED = false;

const pushDebug = (message, details = {}) => {
  console.log('[PUSH_DEBUG]', message, details);
};

const normalizeIsraeliPhone = (phone) => {
  const value = String(phone || '').replace(/[^\d+]/g, '');
  if (/^05\d{8}$/.test(value)) return `+972${value.slice(1)}`;
  if (/^9725\d{8}$/.test(value)) return `+${value}`;
  if (/^\+9725\d{8}$/.test(value)) return value;
  throw new Error(`Invalid Israeli notification phone number: ${value || 'missing'}`);
};

const appointmentStart = (appointment) => {
  const start = DateTime.fromFormat(
    `${appointment.date || ''} ${appointment.startTime || ''}`,
    'yyyy-MM-dd HH:mm',
    { zone: 'Asia/Jerusalem' },
  );

  if (!start.isValid) {
    throw new Error(`Invalid appointment schedule: ${appointment.date} ${appointment.startTime}`);
  }

  return start;
};

const job = ({ id, type, phone, appointmentId, scheduledFor, createdAt, channel = NOTIFICATION_CHANNEL }) => ({
  id,
  data: {
    type,
    channel,
    phone: normalizeIsraeliPhone(phone),
    appointmentId,
    scheduledFor,
    status: NOTIFICATION_STATUS,
    createdAt,
    sentAt: null,
    error: null,
  },
});

export const buildAdminAppointmentCreatedJob = (
  appointmentId,
  adminPhone,
  now = new Date(),
) => job({
  id: `${appointmentId}_admin_created`,
  type: 'appointment_created_admin',
  phone: adminPhone,
  appointmentId,
  scheduledFor: now,
  createdAt: now,
});

export const buildAppointmentApprovedJobs = (
  appointmentId,
  appointment,
  now = new Date(),
) => {
  const start = appointmentStart(appointment);

  return [
    job({
      id: `${appointmentId}_approved`,
      type: 'appointment_approved',
      phone: appointment.customerPhone,
      appointmentId,
      scheduledFor: now,
      createdAt: now,
    }),
    job({
      id: `${appointmentId}_reminder_24h`,
      type: 'appointment_reminder_24h',
      phone: appointment.customerPhone,
      appointmentId,
      scheduledFor: start.minus({ hours: 24 }).toJSDate(),
      createdAt: now,
    }),
    job({
      id: `${appointmentId}_reminder_2h`,
      type: 'appointment_reminder_2h',
      phone: appointment.customerPhone,
      appointmentId,
      scheduledFor: start.minus({ hours: 2 }).toJSDate(),
      createdAt: now,
    }),
  ];
};

export const buildAppointmentCancelledJob = (
  appointmentId,
  appointment,
  now = new Date(),
) => job({
  id: `${appointmentId}_cancelled`,
  type: 'appointment_cancelled',
  phone: appointment.customerPhone,
  appointmentId,
  scheduledFor: now,
  createdAt: now,
});

export const buildWaitingListAvailableJob = (
  waitingListId,
  appointmentId,
  waitingListEntry,
  appointment,
  now = new Date(),
) => {
  const notificationJob = job({
    id: `${waitingListId}_${appointmentId}_available`,
    type: 'waiting_list_slot_available',
    phone: waitingListEntry.phoneNumber,
    appointmentId,
    scheduledFor: now,
    createdAt: now,
  });

  return {
    ...notificationJob,
    data: {
      ...notificationJob.data,
      waitingListId,
      message: `התפנה תור ב־OST BARBER בתאריך ${appointment.date} בשעה ${appointment.startTime}. היכנס לאפליקציה כדי לקבוע לפני שמישהו אחר יתפוס.`,
    },
  };
};

export const buildWaitingListManualJob = (
  waitingListId,
  waitingListEntry,
  now = new Date(),
) => {
  const requestedTime = waitingListEntry.exactTime
    || waitingListEntry.availableStartTime
    || waitingListEntry.startTime
    || '';
  const notificationJob = job({
    id: `${waitingListId}_manual_${now.getTime()}`,
    type: 'waiting_list_manual_notify',
    phone: waitingListEntry.phoneNumber,
    appointmentId: waitingListEntry.availableAppointmentId || null,
    scheduledFor: now,
    createdAt: now,
  });

  return {
    ...notificationJob,
    data: {
      ...notificationJob.data,
      waitingListId,
      message: requestedTime
        ? `התפנה תור ב־OST BARBER בתאריך ${waitingListEntry.date} בשעה ${requestedTime}. היכנס לאפליקציה כדי לקבוע לפני שמישהו אחר יתפוס.`
        : `ייתכן שהתפנה תור ב־OST BARBER בתאריך ${waitingListEntry.date}. היכנס לאפליקציה כדי לבדוק זמינות.`,
    },
  };
};

export const buildWaitingListManualSmsJob = (
  waitingListId,
  waitingListEntry,
  now = new Date(),
) => {
  const requestedTime = waitingListEntry.exactTime
    || waitingListEntry.availableStartTime
    || waitingListEntry.startTime
    || '';
  const notificationJob = job({
    id: `${waitingListId}_manual_sms_${now.getTime()}`,
    type: 'waiting_list_manual_sms_notify',
    channel: 'sms',
    phone: waitingListEntry.phoneNumber,
    appointmentId: waitingListEntry.availableAppointmentId || null,
    scheduledFor: now,
    createdAt: now,
  });

  return {
    ...notificationJob,
    data: {
      ...notificationJob.data,
      waitingListId,
      providerConfigured: false,
      message: requestedTime
        ? `התפנה תור ב־OST BARBER בתאריך ${waitingListEntry.date} בשעה ${requestedTime}. היכנס לאפליקציה כדי לקבוע לפני שמישהו אחר יתפוס.`
        : `ייתכן שהתפנה תור ב־OST BARBER בתאריך ${waitingListEntry.date}. היכנס לאפליקציה כדי לבדוק זמינות.`,
    },
  };
};

// ── Push notification job builders (Phase 1) ──────────────────────────────────
//
// These create notificationJobs documents with channel: 'push'.
// The Phase 2 Cloud Function sender will:
//   1. Read users/{customerId}/pushTokens to find device tokens
//   2. Send via Firebase Admin SDK Messaging
//   3. Update job status to 'sent' or 'failed'

const pushJob = ({ id, customerId, customerPhone, type, title, body, data = {}, scheduledFor, createdAt = new Date() }) => ({
  id,
  data: {
    channel: PUSH_CHANNEL,
    customerId: customerId || null,
    customerPhone: customerPhone || null,
    type,
    title,
    body,
    data,
    scheduledFor: scheduledFor || createdAt,
    status: NOTIFICATION_STATUS,
    attempts: 0,
    lastError: null,
    createdAt,
    sentAt: null,
    error: null,
  },
});

const buildPushJob = (input) => {
  const built = pushJob(input);
  pushDebug('notification job built', {
    jobId: built.id,
    type: built.data.type,
    customerId: built.data.customerId || null,
    targetUserId: built.data.targetUserId || null,
    channel: built.data.channel,
    scheduledFor: built.data.scheduledFor,
  });
  return built;
};

/**
 * Build push notification jobs for an approved appointment:
 * - immediate approval confirmation
 * - 24-hour reminder (scheduled for 24h before appointment start)
 * - 2-hour reminder (scheduled for 2h before appointment start)
 *
 * Returns [] if the appointment has no customerId to target.
 */
export const buildPushJobsForApproval = (
  appointmentId,
  appointment,
  now = new Date(),
) => {
  const customerId = appointment.customerId || null;
  const customerPhone = appointment.customerPhone || null;
  const serviceName = appointment.serviceName || appointment.service_name || '';
  const dateStr = appointment.date || '';
  const timeStr = appointment.startTime || '';

  let start;
  try {
    start = appointmentStart(appointment);
  } catch {
    return [];
  }

  const serviceLabel = serviceName ? ` ל${serviceName}` : '';

  return [
    buildPushJob({
      id: `${appointmentId}_push_approved`,
      customerId,
      customerPhone,
      type: 'appointment_approved',
      title: '✅ התור אושר!',
      body: `התור שלך${serviceLabel} ב-${dateStr} בשעה ${timeStr} אושר. נתראה!`,
      data: { appointmentId, date: dateStr, startTime: timeStr },
      scheduledFor: now,
      createdAt: now,
    }),
    buildPushJob({
      id: `${appointmentId}_push_reminder_24h`,
      customerId,
      customerPhone,
      type: 'appointment_reminder_24h',
      title: '🔔 תזכורת: תור מחר',
      body: `מחר בשעה ${timeStr}${serviceName ? ` (${serviceName})` : ''}. אל תשכח/תשכחי!`,
      data: { appointmentId, date: dateStr, startTime: timeStr },
      scheduledFor: start.minus({ hours: 24 }).toJSDate(),
      createdAt: now,
    }),
    buildPushJob({
      id: `${appointmentId}_push_reminder_2h`,
      customerId,
      customerPhone,
      type: 'appointment_reminder_2h',
      title: '⏰ תזכורת: תור בעוד שעתיים',
      body: `בעוד שעתיים יש לך תור בשעה ${timeStr}. להתראות!`,
      data: { appointmentId, date: dateStr, startTime: timeStr },
      scheduledFor: start.minus({ hours: 2 }).toJSDate(),
      createdAt: now,
    }),
  ];
};

/**
 * Build a push notification job for a cancelled appointment.
 * Returns null if the appointment has no customerId.
 */
export const buildPushJobForCancellation = (
  appointmentId,
  appointment,
  now = new Date(),
) => {
  const customerId = appointment.customerId || null;
  const customerPhone = appointment.customerPhone || null;
  const serviceName = appointment.serviceName || appointment.service_name || '';
  const serviceLabel = serviceName ? ` ל${serviceName}` : '';

  return buildPushJob({
    id: `${appointmentId}_push_cancelled`,
    customerId,
    customerPhone,
    type: 'appointment_cancelled',
    title: 'התור בוטל',
    body: `התור שלך${serviceLabel} בוטל. ניתן לקבוע תור חדש באפליקציה.`,
    data: { appointmentId },
    scheduledFor: now,
    createdAt: now,
  });
};

/**
 * Build a push notification job for a manual admin notify to a waiting list customer.
 */
export const buildPushJobForWaitlistManual = (
  waitingListId,
  waitingListEntry,
  now = new Date(),
) => {
  const customerId = waitingListEntry.customerId || null;
  const customerPhone = waitingListEntry.phoneNumber || null;
  const requestedTime = waitingListEntry.exactTime
    || waitingListEntry.availableStartTime
    || waitingListEntry.startTime
    || '';
  const dateStr = waitingListEntry.date || '';

  return buildPushJob({
    id: `${waitingListId}_manual_push`,
    customerId,
    customerPhone,
    type: 'waiting_list_manual_notify',
    title: '🎉 התפנה תור!',
    body: requestedTime
      ? `התפנה תור ב-OST BARBER בתאריך ${dateStr} בשעה ${requestedTime}. היכנס לאפליקציה לפני שמישהו אחר יתפוס!`
      : `ייתכן שהתפנה תור ב-OST BARBER בתאריך ${dateStr}. היכנס לאפליקציה לבדוק זמינות.`,
    data: { waitingListId, date: dateStr, startTime: requestedTime },
    scheduledFor: now,
    createdAt: now,
  });
};

/**
 * Build a push notification job for a waiting list slot becoming available.
 */
export const buildPushJobForWaitlistMatch = (
  waitingListId,
  appointmentId,
  waitingListEntry,
  appointment,
  now = new Date(),
) => {
  const customerId = waitingListEntry.customerId || null;
  const customerPhone = waitingListEntry.phoneNumber || null;
  const dateStr = appointment.date || waitingListEntry.date || '';
  const timeStr = appointment.startTime || '';

  return buildPushJob({
    id: `${waitingListId}_${appointmentId}_push_available`,
    customerId,
    customerPhone,
    type: 'waiting_list_slot_available',
    title: '🎉 התפנה תור!',
    body: `התפנה תור ב-OST BARBER בתאריך ${dateStr} בשעה ${timeStr}. היכנס לאפליקציה לפני שמישהו אחר יתפוס!`,
    data: { appointmentId, waitingListId, date: dateStr, startTime: timeStr },
    scheduledFor: now,
    createdAt: now,
  });
};
