import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findConflict,
  getScheduleRejectionCode,
  overlaps,
} from '../src/scheduling.js';

const existing = {
  id: 'a',
  barberId: 'barber-1',
  startTime: '09:40',
  endTime: '10:10',
  status: 'confirmed',
};

test('server conflict check blocks overlap and respects buffer', () => {
  assert.equal(overlaps({ startTime: '10:10', endTime: '10:40' }, existing, 0), false);
  assert.equal(overlaps({ startTime: '10:10', endTime: '10:40' }, existing, 10), true);
  assert.equal(overlaps({ startTime: '10:20', endTime: '10:50' }, existing, 10), false);
});

test('server ignores cancelled appointments and other barbers', () => {
  const candidate = { barberId: 'barber-1', startTime: '09:40', endTime: '10:10' };
  assert.equal(findConflict(candidate, [{ ...existing, status: 'cancelled' }], 0), null);
  assert.equal(findConflict(candidate, [{ ...existing, barberId: 'barber-2' }], 0), null);
});

test('server explains closed, outside-hours, and duration-fit rejections', () => {
  const workingHours = [
    { day_of_week: 4, is_open: true, open_time: '09:00', close_time: '12:00', breaks: [] },
    { day_of_week: 5, is_open: false, open_time: '09:00', close_time: '12:00', breaks: [] },
  ];
  assert.equal(getScheduleRejectionCode({
    date: '2030-06-21',
    startTime: '10:00',
    endTime: '10:30',
  }, workingHours), 'business/closed-day');
  assert.equal(getScheduleRejectionCode({
    date: '2030-06-20',
    startTime: '08:50',
    endTime: '09:20',
  }, workingHours), 'appointment/outside-working-hours');
  assert.equal(getScheduleRejectionCode({
    date: '2030-06-20',
    startTime: '11:40',
    endTime: '12:10',
  }, workingHours), 'appointment/duration-does-not-fit');
});
