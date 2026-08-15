export const BLOCKING_STATUSES = new Set(['pending', 'approved', 'confirmed', 'scheduled']);

export const DEFAULT_WORKING_HOURS = [
  { day_of_week: 0, day_name: 'ראשון', is_open: true, open_time: '09:00', close_time: '20:00', breaks: [] },
  { day_of_week: 1, day_name: 'שני', is_open: true, open_time: '09:00', close_time: '20:00', breaks: [] },
  { day_of_week: 2, day_name: 'שלישי', is_open: true, open_time: '09:00', close_time: '20:00', breaks: [] },
  { day_of_week: 3, day_name: 'רביעי', is_open: true, open_time: '09:00', close_time: '20:00', breaks: [] },
  { day_of_week: 4, day_name: 'חמישי', is_open: true, open_time: '09:00', close_time: '21:00', breaks: [] },
  { day_of_week: 5, day_name: 'שישי', is_open: true, open_time: '09:00', close_time: '15:00', breaks: [] },
  { day_of_week: 6, day_name: 'שבת', is_open: false, open_time: null, close_time: null, breaks: [] },
];

export const timeToMinutes = (time) => {
  const match = String(time || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return Number.NaN;
  return (hours * 60) + minutes;
};

export const minutesToTime = (minutes) => {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value < 0 || value >= 24 * 60) return '';
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};

const INACTIVE_RELEASE_STATUSES = new Set(['cancelled', 'canceled', 'inactive', 'archived', 'deleted']);

export const isActiveBookingSlotRelease = (release) => {
  if (!release || release.active === false) return false;
  const status = String(release.status || '').trim();
  return !INACTIVE_RELEASE_STATUSES.has(status);
};

export const getMatchingManualReleaseWindows = (appointment, releases = []) => {
  const slotMinutes = timeToMinutes(appointment.startTime);
  const endMinutes = timeToMinutes(appointment.endTime);
  if (!Number.isFinite(slotMinutes) || !Number.isFinite(endMinutes)) return [];

  return releases.filter((release) => {
    if (!isActiveBookingSlotRelease(release)) return false;
    if (release.date !== appointment.date) return false;
    if (release.barberId !== appointment.barberId) return false;
    const from = timeToMinutes(release.startTime);
    const to = timeToMinutes(release.endTime);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
    return slotMinutes >= from && endMinutes <= to;
  });
};

const hasNumberValue = (value) => value !== undefined && value !== null && value !== '';

export const positiveMinutes = (value, fallback = 0) => {
  if (!hasNumberValue(value)) return Math.max(0, Number(fallback) || 0);
  return Math.max(0, Number(value) || 0);
};

export const addMinutes = (time, duration) => {
  const total = timeToMinutes(time) + Number(duration || 0);
  return minutesToTime(total);
};

export const getAppointmentInterval = (appointment = {}) => {
  const startTime = appointment.startTime || appointment.time;
  const start = timeToMinutes(startTime);
  if (!Number.isFinite(start)) return null;
  const duration = Math.max(1, Number(appointment.serviceDuration || appointment.service_duration || 30));
  const explicitEnd = timeToMinutes(appointment.endTime);
  const end = Number.isFinite(explicitEnd) ? explicitEnd : start + duration;
  if (!Number.isFinite(end) || end <= start) return null;
  return { start, end };
};

export const overlaps = (candidate, existing, bufferMinutes = 0) => {
  const candidateInterval = getAppointmentInterval(candidate);
  const existingInterval = getAppointmentInterval(existing);
  if (!candidateInterval || !existingInterval) return false;
  const candidateStart = candidateInterval.start;
  const candidateEnd = candidateInterval.end;
  const existingStart = existingInterval.start;
  const existingEnd = existingInterval.end;
  if (typeof bufferMinutes === 'object' && bufferMinutes !== null) {
    const candidateBefore = positiveMinutes(bufferMinutes.candidateBufferBeforeMinutes);
    const candidateAfter = positiveMinutes(bufferMinutes.candidateBufferAfterMinutes);
    const existingBefore = positiveMinutes(bufferMinutes.existingBufferBeforeMinutes);
    const existingAfter = positiveMinutes(bufferMinutes.existingBufferAfterMinutes);

    return !(
      candidateStart - candidateBefore >= existingEnd + existingAfter
      || candidateEnd + candidateAfter <= existingStart - existingBefore
    );
  }
  const buffer = Math.max(0, Number(bufferMinutes) || 0);

  return !(candidateStart >= existingEnd + buffer || candidateEnd + buffer <= existingStart);
};

export const findConflict = (candidate, appointments, bufferMinutes, excludeId = null) =>
  appointments.find((appointment) => (
    appointment.id !== excludeId
    && (!candidate.barberId || !appointment.barberId || appointment.barberId === candidate.barberId)
    && BLOCKING_STATUSES.has(appointment.status)
    && overlaps(candidate, appointment, typeof bufferMinutes === 'object' && bufferMinutes !== null
      ? {
        candidateBufferBeforeMinutes: positiveMinutes(candidate.bufferBeforeMinutes, bufferMinutes.defaultBufferBeforeMinutes),
        candidateBufferAfterMinutes: positiveMinutes(candidate.bufferAfterMinutes, bufferMinutes.defaultBufferAfterMinutes),
        existingBufferBeforeMinutes: positiveMinutes(appointment.bufferBeforeMinutes, bufferMinutes.defaultBufferBeforeMinutes),
        existingBufferAfterMinutes: positiveMinutes(appointment.bufferAfterMinutes, bufferMinutes.defaultBufferAfterMinutes),
      }
      : bufferMinutes)
  )) || null;

export const getWorkingHoursForDate = (date, workingHours = []) => {
  const [year, month, day] = String(date || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return workingHours.find((item) => Number(item.day_of_week) === dayOfWeek) || null;
};

export const isDateBlocked = (date, blockedDates = []) => blockedDates.some((entry) => (
  entry?.date === date
  && entry?.active !== false
  && entry?.isFullDay !== false
  && entry?.is_full_day !== false
));

export const getScheduleRejectionCode = (appointment, workingHours = [], blockedDates = []) => {
  if (isDateBlocked(appointment.date, blockedDates)) return 'business/blocked-date';
  const hours = getWorkingHoursForDate(appointment.date, workingHours);
  if (!hours || hours.is_open !== true) return 'business/closed-day';

  const start = timeToMinutes(appointment.startTime);
  const end = timeToMinutes(appointment.endTime);
  const open = timeToMinutes(hours.open_time);
  const close = timeToMinutes(hours.close_time);

  if (![start, end, open, close].every(Number.isFinite)) return 'appointment/invalid-time';
  if (start < open || start >= close) return 'appointment/outside-working-hours';
  if (end > close) return 'appointment/duration-does-not-fit';

  const overlapsBreak = (hours.breaks || []).some((item) => overlaps(
    appointment,
    { startTime: item.start || item.startTime, endTime: item.end || item.endTime },
  ));
  return overlapsBreak ? 'appointment/duration-does-not-fit' : null;
};
