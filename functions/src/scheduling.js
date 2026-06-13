export const BLOCKING_STATUSES = new Set(['pending', 'approved', 'confirmed', 'scheduled']);

export const DEFAULT_WORKING_HOURS = [
  { day_of_week: 0, is_open: true, open_time: '09:00', close_time: '20:00', breaks: [] },
  { day_of_week: 1, is_open: true, open_time: '09:00', close_time: '20:00', breaks: [] },
  { day_of_week: 2, is_open: true, open_time: '09:00', close_time: '20:00', breaks: [] },
  { day_of_week: 3, is_open: true, open_time: '09:00', close_time: '20:00', breaks: [] },
  { day_of_week: 4, is_open: true, open_time: '09:00', close_time: '21:00', breaks: [] },
  { day_of_week: 5, is_open: true, open_time: '09:00', close_time: '15:00', breaks: [] },
  { day_of_week: 6, is_open: false, open_time: '09:00', close_time: '20:00', breaks: [] },
];

export const timeToMinutes = (time) => {
  const [hours, minutes] = String(time || '').split(':').map(Number);
  return (hours * 60) + minutes;
};

export const addMinutes = (time, duration) => {
  const total = timeToMinutes(time) + Number(duration || 0);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export const overlaps = (candidate, existing, bufferMinutes = 0) => {
  const candidateStart = timeToMinutes(candidate.startTime);
  const candidateEnd = timeToMinutes(candidate.endTime);
  const existingStart = timeToMinutes(existing.startTime);
  const existingEnd = timeToMinutes(existing.endTime);
  const buffer = Math.max(0, Number(bufferMinutes) || 0);

  return !(candidateStart >= existingEnd + buffer || candidateEnd + buffer <= existingStart);
};

export const findConflict = (candidate, appointments, bufferMinutes, excludeId = null) =>
  appointments.find((appointment) => (
    appointment.id !== excludeId
    && appointment.barberId === candidate.barberId
    && BLOCKING_STATUSES.has(appointment.status)
    && overlaps(candidate, appointment, bufferMinutes)
  )) || null;

export const getWorkingHoursForDate = (date, workingHours = []) => {
  const [year, month, day] = String(date || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return workingHours.find((item) => Number(item.day_of_week) === dayOfWeek) || null;
};

export const getScheduleRejectionCode = (appointment, workingHours = []) => {
  const hours = getWorkingHoursForDate(appointment.date, workingHours);
  if (!hours || hours.is_open !== true) return 'business/closed-day';

  const start = timeToMinutes(appointment.startTime);
  const end = timeToMinutes(appointment.endTime);
  const open = timeToMinutes(hours.open_time);
  const close = timeToMinutes(hours.close_time);

  if (start < open || start >= close) return 'appointment/outside-working-hours';
  if (end > close) return 'appointment/duration-does-not-fit';

  const overlapsBreak = (hours.breaks || []).some((item) => overlaps(
    appointment,
    { startTime: item.start, endTime: item.end },
  ));
  return overlapsBreak ? 'appointment/duration-does-not-fit' : null;
};
