import {
  getAvailableSlots,
  getWorkingHoursForDate,
  isActiveBookingSlotRelease,
  timeToMinutes,
} from './slotEngine.js';

export const ALL_BARBERS_ID = 'all';
export const ALL_BARBERS_OPTION = {
  id: ALL_BARBERS_ID,
  name: 'כל הספרים',
  isAllBarbers: true,
};

export const isAllBarbersSelection = (barber) =>
  barber?.id === ALL_BARBERS_ID || barber === ALL_BARBERS_ID;

export { isActiveBookingSlotRelease };

export const getRelevantManualReleases = (
  releases = [],
  selectedBarberId = null,
  activeBarberIds = [],
) => {
  const activeBarberSet = new Set(activeBarberIds.filter(Boolean));
  return releases
    .filter(isActiveBookingSlotRelease)
    .filter((release) => !selectedBarberId || release.barberId === selectedBarberId)
    .filter((release) => activeBarberSet.size === 0 || activeBarberSet.has(release.barberId));
};

export const getReleasedDateSet = (
  releases = [],
  selectedBarberId = null,
  activeBarberIds = [],
) => new Set(
  getRelevantManualReleases(releases, selectedBarberId, activeBarberIds)
    .map((release) => release.date)
    .filter(Boolean),
);

export const getManualReleaseStateForDate = ({
  date,
  releases = [],
  selectedBarberId = null,
  activeBarberIds = [],
} = {}) => {
  const relevantReleases = getRelevantManualReleases(releases, selectedBarberId, activeBarberIds);
  const dateReleases = relevantReleases.filter((release) => release.date === date);
  return {
    hasAnyReleaseForSelection: relevantReleases.length > 0,
    hasReleaseOnDate: dateReleases.length > 0,
    releaseCount: dateReleases.length,
  };
};

const slotFitsRelease = (slot, release, duration) => {
  const start = timeToMinutes(slot);
  const end = start + Number(duration || 0);
  const from = timeToMinutes(release.startTime);
  const to = timeToMinutes(release.endTime);
  return Number.isFinite(start)
    && Number.isFinite(end)
    && Number.isFinite(from)
    && Number.isFinite(to)
    && start >= from
    && end <= to;
};

const createSlot = (time, barber, release = null) => ({
  id: `${barber.id}:${time}`,
  time,
  startTime: time,
  barberId: barber.id,
  barberName: barber.name || '',
  releaseId: release?.id || null,
});

const byTimeThenBarber = (left, right) =>
  left.time.localeCompare(right.time) || left.barberName.localeCompare(right.barberName);

export const buildAvailabilitySlots = ({
  date,
  selectedService,
  selectedBarber,
  barbers = [],
  appointmentBlocks = [],
  workingHours = [],
  bookingSettings = {},
  slotReleases = [],
  isDateBlocked = false,
} = {}) => {
  if (!date || !selectedService || isDateBlocked) return [];

  const isAllBarbers = isAllBarbersSelection(selectedBarber);
  const selectedBarbers = isAllBarbers
    ? barbers
    : barbers.filter((barber) => barber.id === selectedBarber?.id);
  if (selectedBarbers.length === 0) return [];

  const settings = bookingSettings || {};
  const slotConfig = {
    date,
    serviceDuration: Number(selectedService.duration || 0),
    service: selectedService,
    blockedTimes: [],
    slotInterval: settings.slotInterval || 10,
    visibleSlotIntervalMinutes: settings.visibleSlotIntervalMinutes || 30,
    bufferMinutes: settings.appointmentBufferMinutes || 0,
    settings,
  };

  const uniqueSlots = new Map();
  if (settings.availabilityMode === 'manual') {
    const activeBarberIds = barbers.map((barber) => barber.id);
    const releases = getRelevantManualReleases(
      slotReleases,
      isAllBarbers ? null : selectedBarber?.id,
      activeBarberIds,
    ).filter((release) => release.date === date);

    selectedBarbers.forEach((barber) => {
      const barberReleases = releases.filter((release) => release.barberId === barber.id);
      const barberAppointments = appointmentBlocks.filter((block) => block.barberId === barber.id);

      barberReleases.forEach((release) => {
        const releaseSlots = getAvailableSlots({
          ...slotConfig,
          appointments: barberAppointments,
          workingHours: {
            open_time: release.startTime,
            close_time: release.endTime,
            breaks: [],
          },
        }).filter((slot) => slotFitsRelease(slot, release, selectedService.duration));

        releaseSlots.forEach((slot) => {
          const normalizedSlot = createSlot(slot, barber, release);
          uniqueSlots.set(normalizedSlot.id, normalizedSlot);
        });
      });
    });

    return [...uniqueSlots.values()].sort(byTimeThenBarber);
  }

  const dayHours = getWorkingHoursForDate(date, workingHours);
  if (!dayHours?.is_open) return [];

  selectedBarbers.forEach((barber) => {
    const barberAppointments = appointmentBlocks.filter((block) => block.barberId === barber.id);
    getAvailableSlots({
      ...slotConfig,
      appointments: barberAppointments,
      workingHours: dayHours,
    }).forEach((slot) => {
      const normalizedSlot = createSlot(slot, barber);
      uniqueSlots.set(normalizedSlot.id, normalizedSlot);
    });
  });

  return [...uniqueSlots.values()].sort(byTimeThenBarber);
};
