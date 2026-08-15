import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAppointmentScheduleLockId,
  getCustomerBookingLockId,
} from '../src/appointments.js';

test('schedule lock id is deterministic per barber and business date', () => {
  assert.equal(
    getAppointmentScheduleLockId({ barberId: 'barber-1', date: '2030-06-20' }),
    'barber-1_2030-06-20',
  );
  assert.equal(
    getAppointmentScheduleLockId({ barberId: 'barber-1', date: '2030-06-20' }),
    getAppointmentScheduleLockId({ barber_id: 'barber-1', date: '2030-06-20' }),
  );
});

test('different barber-day schedules use different lock documents', () => {
  const first = getAppointmentScheduleLockId({ barberId: 'barber-1', date: '2030-06-20' });
  const otherBarber = getAppointmentScheduleLockId({ barberId: 'barber-2', date: '2030-06-20' });
  const otherDate = getAppointmentScheduleLockId({ barberId: 'barber-1', date: '2030-06-21' });
  assert.notEqual(first, otherBarber);
  assert.notEqual(first, otherDate);
});

test('invalid schedule data does not produce a lock path', () => {
  assert.equal(getAppointmentScheduleLockId({ barberId: '', date: '2030-06-20' }), '');
  assert.equal(getAppointmentScheduleLockId({ barberId: 'barber-1', date: '20/06/2030' }), '');
});

test('registered and phone-only customers receive stable booking lock ids', () => {
  assert.equal(getCustomerBookingLockId({ customerId: 'customer-1' }), 'customer-1');
  assert.equal(
    getCustomerBookingLockId({ customerPhone: '+972 50-123-4567' }),
    'phone_972501234567',
  );
  assert.equal(getCustomerBookingLockId({}), '');
});
