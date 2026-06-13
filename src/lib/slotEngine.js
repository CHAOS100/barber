/**
 * OST BARBER - Smart Slot Availability Engine
 */

export function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const BLOCKING_APPOINTMENT_STATUSES = new Set(['pending', 'approved', 'confirmed', 'scheduled']);

export function getAppointmentInterval(appointment) {
  const startTime = appointment.startTime || appointment.time;
  if (!startTime) return null;

  const start = timeToMinutes(startTime);
  const duration = Number(appointment.serviceDuration || appointment.service_duration || 30);
  const end = appointment.endTime ? timeToMinutes(appointment.endTime) : start + duration;
  return { start, end };
}

export function appointmentsOverlap(candidate, existing, bufferMinutes = 0) {
  const next = getAppointmentInterval(candidate);
  const current = getAppointmentInterval(existing);
  if (!next || !current) return false;

  const buffer = Math.max(0, Number(bufferMinutes) || 0);
  return !(next.start >= current.end + buffer || next.end + buffer <= current.start);
}

export function findAppointmentConflict(candidate, appointments = [], bufferMinutes = 0, excludeId = null) {
  return appointments.find((appointment) => (
    appointment.id !== excludeId
    && BLOCKING_APPOINTMENT_STATUSES.has(appointment.status)
    && (!candidate.barberId || !appointment.barberId || appointment.barberId === candidate.barberId)
    && appointmentsOverlap(candidate, appointment, bufferMinutes)
  )) || null;
}

export function localDateToString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getAvailableSlots({
  date,
  serviceDuration,
  appointments = [],
  workingHours,
  blockedTimes = [],
  slotInterval = 10,
  bufferMinutes = 0,
}) {
  if (!workingHours || !workingHours.open_time || !workingHours.close_time) return [];

  const openMin = timeToMinutes(workingHours.open_time);
  const closeMin = timeToMinutes(workingHours.close_time);

  const occupied = appointments
    .filter(a => BLOCKING_APPOINTMENT_STATUSES.has(a.status))
    .map(getAppointmentInterval)
    .filter(Boolean)
    .map(interval => ({ ...interval, buffer: bufferMinutes }));

  (workingHours.breaks || []).forEach(b => {
    occupied.push({ start: timeToMinutes(b.start), end: timeToMinutes(b.end), buffer: 0 });
  });

  blockedTimes.forEach(t => {
    const start = timeToMinutes(t);
    occupied.push({ start, end: start + slotInterval, buffer: 0 });
  });

  const nowDate = new Date();
  const todayStr = localDateToString(nowDate);
  const isToday = date === todayStr;
  const nowMinutes = isToday ? nowDate.getHours() * 60 + nowDate.getMinutes() + 30 : 0;

  const slots = [];
  for (let start = openMin; start + serviceDuration <= closeMin; start += slotInterval) {
    if (isToday && start < nowMinutes) continue;
    const end = start + serviceDuration;
    const overlaps = occupied.some(occ =>
      appointmentsOverlap(
        { startTime: minutesToTime(start), endTime: minutesToTime(end) },
        { startTime: minutesToTime(occ.start), endTime: minutesToTime(occ.end) },
        occ.buffer,
      ));
    if (!overlaps) slots.push(minutesToTime(start));
  }
  return slots;
}

export function getWorkingHoursForDate(date, workingHoursRecords) {
  const [year, month, day] = date.split('-').map(Number);
  const dayOfWeek = new Date(year, month - 1, day).getDay();
  return workingHoursRecords.find(wh => wh.day_of_week === dayOfWeek) || null;
}

export const DEFAULT_WORKING_HOURS = [
  { day_of_week: 0, day_name: 'ראשון',  is_open: true,  open_time: '09:00', close_time: '20:00', breaks: [] },
  { day_of_week: 1, day_name: 'שני',    is_open: true,  open_time: '09:00', close_time: '20:00', breaks: [] },
  { day_of_week: 2, day_name: 'שלישי',  is_open: true,  open_time: '09:00', close_time: '20:00', breaks: [] },
  { day_of_week: 3, day_name: 'רביעי',  is_open: true,  open_time: '09:00', close_time: '20:00', breaks: [] },
  { day_of_week: 4, day_name: 'חמישי',  is_open: true,  open_time: '09:00', close_time: '21:00', breaks: [] },
  { day_of_week: 5, day_name: 'שישי',   is_open: true,  open_time: '09:00', close_time: '15:00', breaks: [] },
  { day_of_week: 6, day_name: 'שבת',    is_open: false, open_time: null,    close_time: null,    breaks: [] },
];
