import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isExpiredAppointmentInboxNotification,
  isVisibleCustomerNotification,
} from '../src/lib/customerNotificationVisibility.js';

const now = new Date('2099-06-20T12:00:00');

test('expired appointment reminder is hidden even when unread', () => {
  const notification = {
    type: 'appointment',
    source: 'reminder',
    status: 'unread',
    date: '2099-06-20',
    startTime: '10:00',
    serviceDuration: 30,
  };

  assert.equal(isExpiredAppointmentInboxNotification(notification, now), true);
  assert.equal(isVisibleCustomerNotification(notification, now), false);
});

test('terminal appointment notifications are hidden', () => {
  assert.equal(isVisibleCustomerNotification({
    type: 'appointment',
    source: 'appointment_status',
    status: 'unread',
    appointmentStatus: 'completed_auto',
  }, now), false);
  assert.equal(isVisibleCustomerNotification({
    type: 'appointment',
    source: 'appointment_status',
    status: 'unread',
    appointmentStatus: 'cancelled',
  }, now), false);
});

test('admin and promotional notifications remain visible', () => {
  assert.equal(isVisibleCustomerNotification({
    type: 'admin_custom',
    source: 'admin_message',
    status: 'unread',
    date: '2099-06-19',
    appointmentStatus: 'completed',
  }, now), true);
  assert.equal(isVisibleCustomerNotification({
    type: 'free_slot',
    source: 'manual_slot_release',
    status: 'unread',
    date: '2099-06-19',
  }, now), true);
});
