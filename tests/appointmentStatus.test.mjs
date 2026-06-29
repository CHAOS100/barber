import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getEffectiveAppointmentStatus,
  isAppointmentActiveForSchedule,
  isAppointmentHistoryForSchedule,
} from '../src/lib/appointmentStatus.js';

test('same-day appointment that already ended is history, not active schedule', () => {
  const now = new Date(2030, 5, 20, 10, 30);
  const appointment = {
    status: 'confirmed',
    date: '2030-06-20',
    startTime: '09:00',
    endTime: '09:30',
  };

  assert.equal(isAppointmentActiveForSchedule(appointment, now), false);
  assert.equal(isAppointmentHistoryForSchedule(appointment, now), true);
  assert.equal(getEffectiveAppointmentStatus(appointment, now), 'completed_auto');
});

test('same-day appointment that has not ended remains active schedule', () => {
  const now = new Date(2030, 5, 20, 10, 30);
  const appointment = {
    status: 'pending',
    date: '2030-06-20',
    startTime: '11:00',
    endTime: '11:30',
  };

  assert.equal(isAppointmentActiveForSchedule(appointment, now), true);
  assert.equal(isAppointmentHistoryForSchedule(appointment, now), false);
  assert.equal(getEffectiveAppointmentStatus(appointment, now), 'pending');
});

test('cancelled appointment is classified by cancellation owner', () => {
  const now = new Date(2030, 5, 20, 10, 30);
  assert.equal(
    getEffectiveAppointmentStatus({ status: 'cancelled', cancellationReason: 'customer_cancelled' }, now),
    'cancelled_by_customer',
  );
  assert.equal(
    getEffectiveAppointmentStatus({ status: 'cancelled', cancellationReason: 'admin_cancelled' }, now),
    'cancelled_by_admin',
  );
});
