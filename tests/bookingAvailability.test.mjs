import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_BARBERS_OPTION,
  buildAvailabilitySlots,
  getManualReleaseStateForDate,
  getReleasedDateSet,
} from '../src/lib/bookingAvailability.js';

const service = { id: 'service-1', name: 'Haircut', duration: 30 };
const barbers = [
  { id: 'barber-a', name: 'Barber A' },
  { id: 'barber-b', name: 'Barber B' },
];
const release = (overrides = {}) => ({
  id: `release-${overrides.barberId || 'barber-a'}-${overrides.date || '2099-06-20'}`,
  date: '2099-06-20',
  barberId: 'barber-a',
  startTime: '10:00',
  endTime: '11:00',
  status: 'active',
  ...overrides,
});

test('calendar released dates are scoped to the selected barber', () => {
  const releases = [
    release({ date: '2099-06-20', barberId: 'barber-a' }),
    release({ date: '2099-06-21', barberId: 'barber-b' }),
  ];

  assert.deepEqual([...getReleasedDateSet(releases, 'barber-a', ['barber-a', 'barber-b'])], ['2099-06-20']);
  assert.deepEqual([...getReleasedDateSet(releases, 'barber-b', ['barber-a', 'barber-b'])], ['2099-06-21']);
});

test('all-barbers calendar highlights when at least one active barber has a release', () => {
  const releasedDates = getReleasedDateSet([
    release({ date: '2099-06-20', barberId: 'barber-a' }),
    release({ date: '2099-06-21', barberId: 'inactive-barber' }),
  ], null, ['barber-a', 'barber-b']);

  assert.equal(releasedDates.has('2099-06-20'), true);
  assert.equal(releasedDates.has('2099-06-21'), false);
});

test('manual release state distinguishes unreleased and released days', () => {
  const releases = [release({ date: '2099-06-20', barberId: 'barber-a' })];

  assert.deepEqual(getManualReleaseStateForDate({
    date: '2099-06-19',
    releases,
    selectedBarberId: 'barber-a',
    activeBarberIds: ['barber-a'],
  }), {
    hasAnyReleaseForSelection: true,
    hasReleaseOnDate: false,
    releaseCount: 0,
  });
  assert.equal(getManualReleaseStateForDate({
    date: '2099-06-20',
    releases,
    selectedBarberId: 'barber-a',
    activeBarberIds: ['barber-a'],
  }).hasReleaseOnDate, true);
});

test('all-barbers availability returns slot objects with real barber IDs', () => {
  const slots = buildAvailabilitySlots({
    date: '2099-06-20',
    selectedService: service,
    selectedBarber: ALL_BARBERS_OPTION,
    barbers,
    appointmentBlocks: [],
    bookingSettings: { availabilityMode: 'manual', visibleSlotIntervalMinutes: 30 },
    slotReleases: [
      release({ barberId: 'barber-a', startTime: '10:00', endTime: '10:30' }),
      release({ barberId: 'barber-b', startTime: '11:00', endTime: '11:30' }),
    ],
  });

  assert.deepEqual(slots.map((slot) => slot.barberId), ['barber-a', 'barber-b']);
  assert.equal(slots.some((slot) => slot.barberId === 'all'), false);
});

test('released day can be full when service duration does not fit', () => {
  const slots = buildAvailabilitySlots({
    date: '2099-06-20',
    selectedService: { ...service, duration: 45 },
    selectedBarber: barbers[0],
    barbers,
    appointmentBlocks: [],
    bookingSettings: { availabilityMode: 'manual', visibleSlotIntervalMinutes: 30 },
    slotReleases: [release({ startTime: '10:00', endTime: '10:30' })],
  });

  assert.equal(slots.length, 0);
});
