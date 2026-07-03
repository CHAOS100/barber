const ACTIVE_NOTIFICATION_STATUSES = new Set(['unread', 'read']);
const APPOINTMENT_NOTIFICATION_TYPES = new Set([
  'appointment',
  'appointment_reminder',
  'appointment_reminder_24h',
  'appointment_reminder_2h',
]);
const APPOINTMENT_NOTIFICATION_SOURCES = new Set([
  'appointment_status',
  'appointment_reminder',
  'appointment_approved',
  'appointment_cancelled',
  'appointment_rejected',
  'reminder',
]);
const TERMINAL_APPOINTMENT_STATUSES = new Set([
  'completed',
  'completed_auto',
  'cancelled',
  'cancelled_by_admin',
  'cancelled_by_customer',
  'rejected',
  'no_show',
]);

const pad = (value) => String(value).padStart(2, '0');

const cleanString = (value) => String(value || '').trim();

const localDateToString = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const timeToMinutes = (time) => {
  const [hours, minutes] = cleanString(time).split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return (hours * 60) + minutes;
};

const getAppointmentStatus = (notification) => cleanString(
  notification?.appointmentStatus
    || notification?.statusType
    || notification?.eventStatus
    || notification?.appointment?.status,
);

export const isAppointmentInboxNotification = (notification) => (
  APPOINTMENT_NOTIFICATION_TYPES.has(notification?.type)
  || APPOINTMENT_NOTIFICATION_SOURCES.has(notification?.source)
);

export const isExpiredAppointmentInboxNotification = (notification, now = new Date()) => {
  if (!isAppointmentInboxNotification(notification)) return false;

  const appointmentStatus = getAppointmentStatus(notification);
  if (TERMINAL_APPOINTMENT_STATUSES.has(appointmentStatus)) return true;

  const date = cleanString(notification?.date || notification?.appointmentDate);
  if (!date) return false;
  const today = localDateToString(now);
  if (date < today) return true;
  if (date > today) return false;

  const endTime = cleanString(
    notification?.endTime
      || notification?.appointmentEndTime
      || notification?.appointment?.endTime,
  );
  const startTime = cleanString(
    notification?.startTime
      || notification?.appointmentStartTime
      || notification?.time
      || notification?.appointment?.startTime,
  );
  const endMinutes = timeToMinutes(endTime)
    ?? (timeToMinutes(startTime) !== null
      ? timeToMinutes(startTime) + Number(notification?.serviceDuration || notification?.duration || 30)
      : null);
  if (endMinutes === null) return false;
  const nowMinutes = (now.getHours() * 60) + now.getMinutes();
  return endMinutes <= nowMinutes;
};

export const isVisibleCustomerNotification = (notification, now = new Date()) => (
  ACTIVE_NOTIFICATION_STATUSES.has(notification?.status)
  && notification?.archivedFromInbox !== true
  && !isExpiredCustomerNotification(notification, now)
  && !isExpiredAppointmentInboxNotification(notification, now)
);

export const isExpiredCustomerNotification = (notification, now = new Date()) => {
  const expiresMs = notification?.expiresAt?.toMillis?.() || 0;
  return expiresMs > 0 && now.getTime() > expiresMs;
};
