export const ACTIVE_APPOINTMENT_STATUSES = new Set(['pending', 'approved', 'confirmed', 'scheduled']);

export const TERMINAL_APPOINTMENT_STATUSES = new Set([
  'completed',
  'completed_auto',
  'cancelled',
  'cancelled_by_admin',
  'cancelled_by_customer',
  'rejected',
  'no_show',
]);

export const CUSTOMER_CANCEL_REASONS = new Set(['customer_cancelled', 'customer_replaced_appointment']);

const pad = (value) => String(value).padStart(2, '0');

export const localDateToString = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const timeToMinutesSafe = (time) => {
  const [hours, minutes] = String(time || '').split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return (hours * 60) + minutes;
};

const appointmentStartTime = (appointment) =>
  appointment?.startTime || appointment?.start_time || appointment?.time || '00:00';

export const appointmentEndTime = (appointment) => {
  if (appointment?.endTime || appointment?.end_time) {
    return appointment.endTime || appointment.end_time;
  }
  const start = timeToMinutesSafe(appointmentStartTime(appointment));
  const duration = Number(
    appointment?.serviceDuration
      ?? appointment?.service_duration
      ?? appointment?.duration
      ?? 30,
  );
  if (start === null || !Number.isFinite(duration)) return appointmentStartTime(appointment);
  const total = Math.max(0, start + duration);
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
};

export const isAppointmentPastByEndTime = (appointment, now = new Date()) => {
  const date = appointment?.date || '';
  const today = localDateToString(now);
  if (!date) return false;
  if (date < today) return true;
  if (date > today) return false;

  const end = timeToMinutesSafe(appointmentEndTime(appointment));
  const current = (now.getHours() * 60) + now.getMinutes();
  return end !== null && end <= current;
};

export const isAppointmentActiveForSchedule = (appointment, now = new Date()) =>
  ACTIVE_APPOINTMENT_STATUSES.has(appointment?.status)
  && !isAppointmentPastByEndTime(appointment, now);

export const isAppointmentHistoryForSchedule = (appointment, now = new Date()) =>
  !isAppointmentActiveForSchedule(appointment, now);

export const getEffectiveAppointmentStatus = (appointment, now = new Date()) => {
  if (
    ACTIVE_APPOINTMENT_STATUSES.has(appointment?.status)
    && isAppointmentPastByEndTime(appointment, now)
  ) {
    return 'completed_auto';
  }
  if (appointment?.status === 'cancelled') {
    const reason = appointment.cancellationReason || appointment.cancellation_reason || '';
    return CUSTOMER_CANCEL_REASONS.has(reason) ? 'cancelled_by_customer' : 'cancelled_by_admin';
  }
  return appointment?.status;
};
