export const BLOCKING_STATUSES = new Set(['pending', 'approved', 'confirmed']);

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
