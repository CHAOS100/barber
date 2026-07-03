import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findConflict,
  getMatchingManualReleaseWindows,
  isActiveBookingSlotRelease,
} from '../src/scheduling.js';

const appointment = (overrides = {}) => ({
  date: '2099-06-20',
  startTime: '10:00',
  endTime: '10:30',
  barberId: 'barber-a',
  status: 'pending',
  ...overrides,
});

const release = (overrides = {}) => ({
  date: '2099-06-20',
  startTime: '09:00',
  endTime: '12:00',
  barberId: 'barber-a',
  status: 'active',
  ...overrides,
});

test('manual release validation rejects when no release exists', () => {
  assert.equal(getMatchingManualReleaseWindows(appointment(), []).length, 0);
});

test('manual release validation isolates releases by barber', () => {
  const releases = [release({ barberId: 'barber-b' })];
  assert.equal(getMatchingManualReleaseWindows(appointment(), releases).length, 0);
});

test('manual release validation requires full duration inside the window', () => {
  assert.equal(
    getMatchingManualReleaseWindows(
      appointment({ startTime: '10:00', endTime: '10:45' }),
      [release({ startTime: '10:00', endTime: '10:30' })],
    ).length,
    0,
  );
  assert.equal(
    getMatchingManualReleaseWindows(
      appointment({ startTime: '10:00', endTime: '10:30' }),
      [release({ startTime: '10:00', endTime: '10:30' })],
    ).length,
    1,
  );
});

test('manual release validation rejects outside and partial overlaps', () => {
  assert.equal(
    getMatchingManualReleaseWindows(
      appointment({ startTime: '08:45', endTime: '09:15' }),
      [release({ startTime: '09:00', endTime: '12:00' })],
    ).length,
    0,
  );
  assert.equal(
    getMatchingManualReleaseWindows(
      appointment({ startTime: '11:45', endTime: '12:15' }),
      [release({ startTime: '09:00', endTime: '12:00' })],
    ).length,
    0,
  );
});

test('release active flag supports legacy docs but excludes cancelled/inactive docs', () => {
  assert.equal(isActiveBookingSlotRelease(release({ status: undefined })), true);
  assert.equal(isActiveBookingSlotRelease(release({ active: true, status: undefined })), true);
  assert.equal(isActiveBookingSlotRelease(release({ status: 'cancelled' })), false);
  assert.equal(isActiveBookingSlotRelease(release({ active: false, status: 'active' })), false);
});

test('cancelled and completed appointments do not block, active overlap blocks', () => {
  const candidate = appointment();
  assert.equal(findConflict(candidate, [{ id: 'old', ...candidate, status: 'cancelled' }], 0), null);
  assert.equal(findConflict(candidate, [{ id: 'done', ...candidate, status: 'completed' }], 0), null);
  assert.equal(
    findConflict(candidate, [{ id: 'active', ...candidate, status: 'confirmed' }], 0)?.id,
    'active',
  );
});
