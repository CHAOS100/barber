import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findAppointmentConflict,
  getAvailableSlots,
} from '../src/lib/slotEngine.js';

const workingHours = {
  open_time: '09:00',
  close_time: '12:00',
  breaks: [],
};

const existing = {
  id: 'existing',
  barberId: 'barber-1',
  startTime: '09:40',
  endTime: '10:10',
  serviceDuration: 30,
  status: 'confirmed',
};

const slots = (bufferMinutes, appointments = [existing], serviceDuration = 30) =>
  getAvailableSlots({
    date: '2030-06-20',
    serviceDuration,
    appointments,
    workingHours,
    bufferMinutes,
    slotInterval: 10,
  });

test('same time cannot be booked twice for the same barber', () => {
  const conflict = findAppointmentConflict({
    barberId: 'barber-1',
    startTime: '09:40',
    endTime: '10:10',
  }, [existing], 0);
  assert.equal(conflict?.id, 'existing');
});

test('09:40 plus 30 minutes allows 10:10 with zero buffer', () => {
  assert.equal(slots(0).includes('10:10'), true);
  assert.equal(slots(0).includes('10:00'), false);
});

test('09:40 plus 30 minutes and 10 minute buffer allows 10:20', () => {
  assert.equal(slots(10).includes('10:10'), false);
  assert.equal(slots(10).includes('10:20'), true);
});

test('editing duration recalculates availability', () => {
  const longer = { ...existing, endTime: '10:20', serviceDuration: 40 };
  assert.equal(slots(0, [longer]).includes('10:10'), false);
  assert.equal(slots(0, [longer]).includes('10:20'), true);
});

test('cancelled appointment frees its slot', () => {
  assert.equal(slots(0, [{ ...existing, status: 'cancelled' }]).includes('09:40'), true);
});

test('scheduled appointment blocks its slot', () => {
  assert.equal(slots(0, [{ ...existing, status: 'scheduled' }]).includes('09:40'), false);
});
