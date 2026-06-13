import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  findActiveCustomerAppointment,
  isCustomerBlocked,
} from '../src/bookingPolicy.js';

test('blocked customer is detected from current and legacy boolean fields', () => {
  assert.equal(isCustomerBlocked({ blocked: true }), true);
  assert.equal(isCustomerBlocked({ blocked: false }), false);
  assert.equal(isCustomerBlocked({ isBlocked: true }), true);
});

test('active appointment limit includes all bookable active statuses', () => {
  assert.deepEqual([...ACTIVE_APPOINTMENT_STATUSES], ['pending', 'approved', 'confirmed', 'scheduled']);
  assert.equal(findActiveCustomerAppointment([{ id: 'a', status: 'cancelled' }]), null);
  assert.equal(findActiveCustomerAppointment([
    { id: 'a', status: 'completed' },
    { id: 'b', status: 'scheduled' },
  ]).id, 'b');
  assert.equal(findActiveCustomerAppointment([
    { id: 'a', status: 'completed' },
    { id: 'b', status: 'cancelled' },
    { id: 'c', status: 'rejected' },
    { id: 'd', status: 'no_show' },
  ]), null);
});
