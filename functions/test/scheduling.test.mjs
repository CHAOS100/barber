import test from 'node:test';
import assert from 'node:assert/strict';
import { findConflict, overlaps } from '../src/scheduling.js';

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
