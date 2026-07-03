import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAdminAppointmentCreatedJob,
  buildAppointmentApprovedJobs,
  buildAppointmentCancelledJob,
  buildWaitingListAvailableJob,
  buildWaitingListManualJob,
  buildWaitingListManualSmsJob,
  buildPushJobForSlotsReleased,
  buildSlotsReleasedMessage,
} from '../src/notifications/notificationJobs.js';

const appointment = {
  customerPhone: '054-1234567',
  date: '2026-06-20',
  startTime: '10:00',
};

test('new appointment creates an immediate admin WhatsApp job', () => {
  const now = new Date('2026-06-12T12:00:00.000Z');
  const notificationJob = buildAdminAppointmentCreatedJob('appointment-1', '0500000000', now);

  assert.equal(notificationJob.id, 'appointment-1_admin_created');
  assert.equal(notificationJob.data.type, 'appointment_created_admin');
  assert.equal(notificationJob.data.channel, 'whatsapp');
  assert.equal(notificationJob.data.phone, '+972500000000');
  assert.equal(notificationJob.data.status, 'pending');
  assert.equal(notificationJob.data.scheduledFor, now);
});

test('approved appointment creates approval, 24h, and 2h WhatsApp jobs', () => {
  const jobs = buildAppointmentApprovedJobs(
    'appointment-1',
    appointment,
    new Date('2026-06-12T12:00:00.000Z'),
  );

  assert.deepEqual(
    jobs.map(({ data }) => data.type),
    ['appointment_approved', 'appointment_reminder_24h', 'appointment_reminder_2h'],
  );
  assert.ok(jobs.every(({ data }) => data.phone === '+972541234567'));
  assert.equal(jobs[1].data.scheduledFor.toISOString(), '2026-06-19T07:00:00.000Z');
  assert.equal(jobs[2].data.scheduledFor.toISOString(), '2026-06-20T05:00:00.000Z');
});

test('cancelled appointment creates an immediate customer WhatsApp job', () => {
  const notificationJob = buildAppointmentCancelledJob(
    'appointment-1',
    appointment,
    new Date('2026-06-12T12:00:00.000Z'),
  );

  assert.equal(notificationJob.id, 'appointment-1_cancelled');
  assert.equal(notificationJob.data.type, 'appointment_cancelled');
  assert.equal(notificationJob.data.phone, '+972541234567');
});

test('available slot creates waiting list WhatsApp job with message', () => {
  const notificationJob = buildWaitingListAvailableJob(
    'wait-1',
    'appointment-1',
    { phoneNumber: '054-1234567' },
    { date: '2026-06-20', startTime: '10:00' },
    new Date('2026-06-12T12:00:00.000Z'),
  );

  assert.equal(notificationJob.id, 'wait-1_appointment-1_available');
  assert.equal(notificationJob.data.type, 'waiting_list_slot_available');
  assert.equal(notificationJob.data.phone, '+972541234567');
  assert.equal(notificationJob.data.waitingListId, 'wait-1');
  assert.match(notificationJob.data.message, /התפנה תור/);
});

test('manual waiting list notify creates WhatsApp job', () => {
  const notificationJob = buildWaitingListManualJob(
    'wait-1',
    { phoneNumber: '054-1234567', date: '2026-06-20', exactTime: '11:00' },
    new Date('2026-06-12T12:00:00.000Z'),
  );

  assert.equal(notificationJob.id, 'wait-1_manual_1781265600000');
  assert.equal(notificationJob.data.type, 'waiting_list_manual_notify');
  assert.equal(notificationJob.data.phone, '+972541234567');
  assert.equal(notificationJob.data.waitingListId, 'wait-1');
});

test('manual waiting list SMS notify creates queued SMS job', () => {
  const notificationJob = buildWaitingListManualSmsJob(
    'wait-1',
    { phoneNumber: '054-1234567', date: '2026-06-20', exactTime: '11:00' },
    new Date('2026-06-12T12:00:00.000Z'),
  );

  assert.equal(notificationJob.id, 'wait-1_manual_sms_1781265600000');
  assert.equal(notificationJob.data.type, 'waiting_list_manual_sms_notify');
  assert.equal(notificationJob.data.channel, 'sms');
  assert.equal(notificationJob.data.phone, '+972541234567');
  assert.equal(notificationJob.data.providerConfigured, false);
});

test('slots released push mentions a specific barber and keeps one customer/batch id', () => {
  const job = buildPushJobForSlotsReleased(
    'customer-1',
    'batch-1',
    new Date('2026-06-12T12:00:00.000Z'),
    { barberMode: 'single', barberId: 'barber-a', barberName: 'דוד' },
  );

  assert.equal(job.id, 'slots_released_batch-1_customer-1');
  assert.equal(job.data.type, 'slots_released');
  assert.equal(job.data.data.barberId, 'barber-a');
  assert.match(job.data.body, /דוד/);
});

test('slots released all-barbers message includes names', () => {
  const message = buildSlotsReleasedMessage({
    barberMode: 'all',
    barberNames: ['דוד', 'יוסי'],
  });

  assert.match(message.body, /כל הספרים/);
  assert.match(message.body, /דוד/);
  assert.match(message.body, /יוסי/);
});
