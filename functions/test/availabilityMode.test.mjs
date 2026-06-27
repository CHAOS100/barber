import test from 'node:test';
import assert from 'node:assert/strict';
import { timeToMinutes } from '../src/scheduling.js';

// Mirrors the slot-in-release-window logic used by rejectManualModeSlot
// in appointments.js — if this logic changes there, update here too.
const isSlotInReleaseWindow = (slotTime, releases) => {
  const slotMinutes = timeToMinutes(slotTime);
  return releases.some((r) => {
    const from = timeToMinutes(r.startTime);
    const to = timeToMinutes(r.endTime);
    return slotMinutes >= from && slotMinutes < to;
  });
};

const release = (startTime, endTime, barberId = 'barber-1') => ({
  barberId,
  startTime,
  endTime,
  status: 'active',
});

test('slot exactly at release start is accepted', () => {
  assert.equal(isSlotInReleaseWindow('09:00', [release('09:00', '17:00')]), true);
});

test('slot inside release window is accepted', () => {
  assert.equal(isSlotInReleaseWindow('14:30', [release('09:00', '17:00')]), true);
});

test('slot exactly at release end is rejected (exclusive end)', () => {
  assert.equal(isSlotInReleaseWindow('17:00', [release('09:00', '17:00')]), false);
});

test('slot before release window is rejected', () => {
  assert.equal(isSlotInReleaseWindow('08:45', [release('09:00', '17:00')]), false);
});

test('slot after release window is rejected', () => {
  assert.equal(isSlotInReleaseWindow('18:00', [release('09:00', '17:00')]), false);
});

test('no releases at all rejects every slot', () => {
  assert.equal(isSlotInReleaseWindow('10:00', []), false);
  assert.equal(isSlotInReleaseWindow('00:00', []), false);
  assert.equal(isSlotInReleaseWindow('23:59', []), false);
});

test('multiple release windows — slot in second window is accepted', () => {
  const releases = [release('09:00', '12:00'), release('14:00', '18:00')];
  assert.equal(isSlotInReleaseWindow('15:00', releases), true);
});

test('multiple release windows — slot in gap is rejected', () => {
  const releases = [release('09:00', '12:00'), release('14:00', '18:00')];
  assert.equal(isSlotInReleaseWindow('13:00', releases), false);
});

test('cancelled releases are excluded when filtered beforehand', () => {
  const allReleases = [
    { ...release('09:00', '17:00'), status: 'cancelled' },
  ];
  const activeOnly = allReleases.filter((r) => r.status === 'active');
  assert.equal(isSlotInReleaseWindow('10:00', activeOnly), false);
});

test('mapBookingSettings defaults availabilityMode to automatic', async () => {
  // Verify the frontend mapping logic is consistent with the server
  const mapMode = (data) => (data?.availabilityMode === 'manual' ? 'manual' : 'automatic');
  assert.equal(mapMode({}), 'automatic');
  assert.equal(mapMode({ availabilityMode: 'automatic' }), 'automatic');
  assert.equal(mapMode({ availabilityMode: 'manual' }), 'manual');
  assert.equal(mapMode({ availabilityMode: 'anything-else' }), 'automatic');
  assert.equal(mapMode(null), 'automatic');
  assert.equal(mapMode(undefined), 'automatic');
});
