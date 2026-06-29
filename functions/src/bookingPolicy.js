export const ACTIVE_APPOINTMENT_STATUSES = new Set(['pending', 'approved', 'confirmed', 'scheduled']);

const pad = (value) => String(value).padStart(2, '0');

const israelDateTimeParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: Number(value('hour')),
    minute: Number(value('minute')),
  };
};

export const localDateString = (date = new Date()) => {
  const parts = israelDateTimeParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const timeToMinutes = (time) => {
  const [hours, minutes] = String(time || '').split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return (hours * 60) + minutes;
};

const addMinutesToTime = (time, minutes) => {
  const start = timeToMinutes(time);
  if (start === null) return time || '00:00';
  const total = Math.max(0, start + Number(minutes || 0));
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
};

const appointmentStartTime = (appointment) =>
  appointment?.startTime || appointment?.start_time || appointment?.time || '00:00';

export const appointmentEndTime = (appointment) =>
  appointment?.endTime
  || appointment?.end_time
  || addMinutesToTime(
    appointmentStartTime(appointment),
    appointment?.serviceDuration ?? appointment?.service_duration ?? appointment?.duration ?? 30,
  );

export const isAppointmentPastByEndTime = (appointment, now = new Date()) => {
  const date = appointment?.date || '';
  const today = localDateString(now);
  if (!date) return false;
  if (date < today) return true;
  if (date > today) return false;

  const end = timeToMinutes(appointmentEndTime(appointment));
  const currentParts = israelDateTimeParts(now);
  const current = (currentParts.hour * 60) + currentParts.minute;
  return end !== null && end <= current;
};

export const isActiveCustomerAppointment = (appointment, now = new Date()) =>
  ACTIVE_APPOINTMENT_STATUSES.has(appointment?.status)
  && !isAppointmentPastByEndTime(appointment, now);

export const isCustomerBlocked = (customer) =>
  customer?.blocked === true || customer?.isBlocked === true;

export const hasActivePaymentRequest = (customer) =>
  customer?.requiresNoShowPayment === true
  || customer?.requires_no_show_payment === true
  || Number(customer?.noShowPaymentAmount ?? customer?.no_show_payment_amount ?? 0) > 0;

export const findActiveCustomerAppointment = (appointments, now = new Date()) => {
  return (
    appointments.find(
      (appointment) => isActiveCustomerAppointment(appointment, now),
    ) || null
  );
};
