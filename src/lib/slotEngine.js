/**
 * OST BARBER availability facade.
 *
 * Pure scheduling primitives live in functions/src/scheduling.js so browser
 * availability and trusted callable validation use the same rules.
 */
import {
  BLOCKING_STATUSES,
  DEFAULT_WORKING_HOURS,
  findConflict,
  getAppointmentInterval,
  getScheduleRejectionCode,
  getWorkingHoursForDate,
  isActiveBookingSlotRelease,
  isDateBlocked,
  minutesToTime,
  overlaps,
  positiveMinutes,
  timeToMinutes,
} from '../../functions/src/scheduling.js';

export {
  DEFAULT_WORKING_HOURS,
  getAppointmentInterval,
  getScheduleRejectionCode,
  getWorkingHoursForDate,
  isActiveBookingSlotRelease,
  isDateBlocked,
  minutesToTime,
  positiveMinutes,
  timeToMinutes,
};

export const BLOCKING_APPOINTMENT_STATUSES = BLOCKING_STATUSES;
export const DEFAULT_VISIBLE_SLOT_INTERVAL_MINUTES = 30;
export const appointmentsOverlap = overlaps;

export function findAppointmentConflict(candidate, appointments = [], bufferMinutes = 0, excludeId = null) {
  return findConflict(candidate, appointments, bufferMinutes, excludeId);
}

const hasNumberValue = (value) => value !== undefined && value !== null && value !== '';

export function getResolvedAppointmentBuffers({
  settings = {},
  fallbackBufferMinutes = 0,
} = {}) {
  const normalizedSettings = /** @type {Record<string, any>} */ (settings || {});
  const globalAfter = hasNumberValue(normalizedSettings.appointmentBufferMinutes)
    ? normalizedSettings.appointmentBufferMinutes
    : (
      hasNumberValue(normalizedSettings.defaultAppointmentBufferAfterMinutes)
        ? normalizedSettings.defaultAppointmentBufferAfterMinutes
        : fallbackBufferMinutes
    );

  return {
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: positiveMinutes(globalAfter, 0),
  };
}

export function localDateToString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getAvailableSlots({
  date,
  serviceDuration,
  service = {},
  appointments = [],
  workingHours,
  blockedTimes = [],
  slotInterval = DEFAULT_VISIBLE_SLOT_INTERVAL_MINUTES,
  visibleSlotIntervalMinutes,
  bufferMinutes = 0,
  settings = {},
}) {
  if (!workingHours?.is_open && workingHours?.is_open !== undefined) return [];
  if (!workingHours?.open_time || !workingHours?.close_time) return [];
  const normalizedSettings = /** @type {Record<string, any>} */ (settings || {});

  const openMin = timeToMinutes(workingHours.open_time);
  const closeMin = timeToMinutes(workingHours.close_time);
  if (!Number.isFinite(openMin) || !Number.isFinite(closeMin) || openMin >= closeMin) return [];
  const visibleInterval = Math.max(
    1,
    Number(visibleSlotIntervalMinutes || normalizedSettings.visibleSlotIntervalMinutes || slotInterval || DEFAULT_VISIBLE_SLOT_INTERVAL_MINUTES),
  );
  const duration = Math.max(1, Number(serviceDuration || service.duration || 0));
  const candidateBuffers = getResolvedAppointmentBuffers({
    settings,
    fallbackBufferMinutes: bufferMinutes,
  });

  const occupied = appointments
    .filter((appointment) => BLOCKING_STATUSES.has(appointment.status))
    .map((appointment) => {
      const interval = getAppointmentInterval(appointment);
      if (!interval) return null;
      return {
        ...interval,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: hasNumberValue(appointment.bufferAfterMinutes)
          ? positiveMinutes(appointment.bufferAfterMinutes)
          : candidateBuffers.bufferAfterMinutes,
      };
    })
    .filter(Boolean);

  (workingHours.breaks || []).forEach((item) => {
    const start = timeToMinutes(item.start || item.startTime);
    const end = timeToMinutes(item.end || item.endTime);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      occupied.push({ start, end, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 });
    }
  });

  blockedTimes.forEach((time) => {
    const start = timeToMinutes(time);
    if (Number.isFinite(start)) {
      occupied.push({ start, end: start + visibleInterval, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 });
    }
  });

  const nowDate = new Date();
  const todayStr = localDateToString(nowDate);
  const isToday = date === todayStr;
  const nowMinutes = isToday ? nowDate.getHours() * 60 + nowDate.getMinutes() + 30 : 0;

  const slots = [];
  for (let start = openMin; start + duration <= closeMin; start += visibleInterval) {
    if (isToday && start < nowMinutes) continue;
    const end = start + duration;
    const hasOverlap = occupied.some((item) => overlaps(
      { startTime: minutesToTime(start), endTime: minutesToTime(end) },
      { startTime: minutesToTime(item.start), endTime: minutesToTime(item.end) },
      {
        candidateBufferBeforeMinutes: candidateBuffers.bufferBeforeMinutes,
        candidateBufferAfterMinutes: candidateBuffers.bufferAfterMinutes,
        existingBufferBeforeMinutes: item.bufferBeforeMinutes,
        existingBufferAfterMinutes: item.bufferAfterMinutes,
      },
    ));
    if (!hasOverlap) slots.push(minutesToTime(start));
  }
  return slots;
}
