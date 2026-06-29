import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  findActiveCustomerAppointment,
  hasActivePaymentRequest,
  isActiveCustomerAppointment,
  isCustomerBlocked,
} from '../src/bookingPolicy.js';

test('blocked customer is detected from current and legacy boolean fields', () => {
  assert.equal(isCustomerBlocked({ blocked: true }), true);
  assert.equal(isCustomerBlocked({ blocked: false }), false);
  assert.equal(isCustomerBlocked({ isBlocked: true }), true);
});

test('active appointment limit includes all bookable active statuses', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  assert.deepEqual([...ACTIVE_APPOINTMENT_STATUSES], ['pending', 'approved', 'confirmed', 'scheduled']);
  assert.equal(findActiveCustomerAppointment([{ id: 'a', status: 'cancelled', date: tomorrow }]), null);
  assert.equal(findActiveCustomerAppointment([
    { id: 'a', status: 'completed', date: tomorrow },
    { id: 'b', status: 'scheduled', date: tomorrow },
  ]).id, 'b');
  assert.equal(findActiveCustomerAppointment([
    { id: 'a', status: 'completed', date: tomorrow },
    { id: 'b', status: 'cancelled', date: tomorrow },
    { id: 'c', status: 'rejected', date: tomorrow },
    { id: 'd', status: 'no_show', date: tomorrow },
  ]), null);
});

test('same-day appointment that already ended is not active', () => {
  const now = new Date('2030-06-20T10:30:00+03:00');
  const appointment = {
    id: 'past-today',
    status: 'confirmed',
    date: '2030-06-20',
    startTime: '09:00',
    endTime: '09:30',
  };
  assert.equal(isActiveCustomerAppointment(appointment, now), false);
  assert.equal(findActiveCustomerAppointment([appointment], now), null);
});

test('same-day appointment that has not ended is active', () => {
  const now = new Date('2030-06-20T10:30:00+03:00');
  const appointment = {
    id: 'future-today',
    status: 'approved',
    date: '2030-06-20',
    startTime: '11:00',
    endTime: '11:30',
  };
  assert.equal(isActiveCustomerAppointment(appointment, now), true);
  assert.equal(findActiveCustomerAppointment([appointment], now)?.id, 'future-today');
});

test('active payment request is detected from current and legacy fields', () => {
  assert.equal(hasActivePaymentRequest({ requiresNoShowPayment: true }), true);
  assert.equal(hasActivePaymentRequest({ requires_no_show_payment: true }), true);
  assert.equal(hasActivePaymentRequest({ noShowPaymentAmount: 50 }), true);
  assert.equal(hasActivePaymentRequest({ no_show_payment_amount: 50 }), true);
  assert.equal(hasActivePaymentRequest({ requiresNoShowPayment: false, noShowPaymentAmount: 0 }), false);
});
