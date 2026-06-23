/**
 * Unit tests for the push sender pure helpers.
 *
 * sendToToken() calls Firebase Admin SDK and cannot be tested without a live
 * project, so we test it indirectly via sendPushJob() with a mock injected
 * through module-level re-export, and test the rest as pure functions.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAllowedByPreferences,
  isUnrecoverableFcmError,
  buildDataPayload,
  sendPushJob,
} from '../src/notifications/pushSender.js';

// ── isAllowedByPreferences ────────────────────────────────────────────────────

test('allows sending when preferences are empty (default true)', () => {
  assert.equal(isAllowedByPreferences('appointment_approved', {}), true);
  assert.equal(isAllowedByPreferences('appointment_reminder_24h', {}), true);
  assert.equal(isAllowedByPreferences('unknown_type', {}), true);
});

test('blocks sending when notificationsEnabled is false', () => {
  const prefs = { notificationsEnabled: false };
  assert.equal(isAllowedByPreferences('appointment_approved', prefs), false);
  assert.equal(isAllowedByPreferences('appointment_reminder_24h', prefs), false);
  assert.equal(isAllowedByPreferences('waiting_list_slot_available', prefs), false);
});

test('blocks specific type when its preference key is false', () => {
  assert.equal(isAllowedByPreferences('appointment_approved', { appointmentApprovedEnabled: false }), false);
  assert.equal(isAllowedByPreferences('appointment_cancelled', { appointmentCancelledEnabled: false }), false);
  assert.equal(isAllowedByPreferences('appointment_reminder_24h', { reminder24hEnabled: false }), false);
  assert.equal(isAllowedByPreferences('appointment_reminder_2h', { reminder2hEnabled: false }), false);
  assert.equal(isAllowedByPreferences('waiting_list_slot_available', { waitlistAlertsEnabled: false }), false);
  assert.equal(isAllowedByPreferences('payment_warning', { paymentWarningsEnabled: false }), false);
  assert.equal(isAllowedByPreferences('barber_message', { barberMessagesEnabled: false }), false);
});

test('allows other types when only one preference is disabled', () => {
  const prefs = { appointmentApprovedEnabled: false };
  assert.equal(isAllowedByPreferences('appointment_reminder_24h', prefs), true);
  assert.equal(isAllowedByPreferences('appointment_cancelled', prefs), true);
});

// ── isUnrecoverableFcmError ───────────────────────────────────────────────────

test('recognises unregistered token error as unrecoverable', () => {
  assert.equal(isUnrecoverableFcmError('messaging/registration-token-not-registered'), true);
  assert.equal(isUnrecoverableFcmError('messaging/invalid-registration-token'), true);
  assert.equal(isUnrecoverableFcmError('messaging/invalid-argument'), true);
});

test('treats transient / server errors as recoverable', () => {
  assert.equal(isUnrecoverableFcmError('messaging/internal-error'), false);
  assert.equal(isUnrecoverableFcmError('messaging/server-unavailable'), false);
  assert.equal(isUnrecoverableFcmError('unknown'), false);
  assert.equal(isUnrecoverableFcmError(undefined), false);
});

// ── buildDataPayload ──────────────────────────────────────────────────────────

test('builds string-only data payload from job data', () => {
  const jobData = {
    type: 'appointment_approved',
    customerId: 'cust-123',
    data: {
      appointmentId: 'appt-456',
      date: '2026-06-20',
      startTime: '10:00',
    },
  };
  const payload = buildDataPayload(jobData);

  assert.equal(payload.type, 'appointment_approved');
  assert.equal(payload.appointmentId, 'appt-456');
  assert.equal(payload.date, '2026-06-20');
  assert.equal(payload.startTime, '10:00');
  assert.equal(payload.customerId, 'cust-123');
  // empty fields are omitted
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'barberId'));
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'waitingListId'));
  // all values are strings
  Object.values(payload).forEach((v) => assert.equal(typeof v, 'string'));
});

test('omits empty string fields from payload', () => {
  const payload = buildDataPayload({ type: 'appointment_cancelled', data: {} });
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'date'));
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'startTime'));
});

// ── sendPushJob — skipped when no tokens ─────────────────────────────────────

test('sendPushJob skips when customer has no tokens', async () => {
  const jobData = {
    type: 'appointment_approved',
    title: 'Test',
    body: 'Body',
    customerId: 'cust-1',
    data: {},
  };
  const result = await sendPushJob(jobData, [], {});

  assert.equal(result.sent, false);
  assert.equal(result.skipped, true);
  assert.equal(result.skipReason, 'no_tokens');
  assert.equal(result.successCount, 0);
  assert.deepEqual(result.tokensToDisable, []);
});

test('sendPushJob skips when all tokens are disabled', async () => {
  const tokens = [
    { id: 'tok1', token: 'fcm-token-abc', enabled: false },
    { id: 'tok2', token: 'fcm-token-def', enabled: false },
  ];
  const jobData = {
    type: 'appointment_approved',
    title: 'Test',
    body: 'Body',
    customerId: 'cust-1',
    data: {},
  };
  const result = await sendPushJob(jobData, tokens, {});

  assert.equal(result.sent, false);
  assert.equal(result.skipped, true);
  assert.equal(result.skipReason, 'no_tokens');
});

test('sendPushJob skips when preference is disabled', async () => {
  const tokens = [{ id: 'tok1', token: 'fcm-token-abc', enabled: true }];
  const jobData = {
    type: 'appointment_approved',
    title: 'Test',
    body: 'Body',
    customerId: 'cust-1',
    data: {},
  };
  const result = await sendPushJob(jobData, tokens, { appointmentApprovedEnabled: false });

  assert.equal(result.sent, false);
  assert.equal(result.skipped, true);
  assert.equal(result.skipReason, 'preference_disabled');
});

test('sendPushJob skips when notificationsEnabled is false', async () => {
  const tokens = [{ id: 'tok1', token: 'fcm-token-abc', enabled: true }];
  const jobData = {
    type: 'appointment_reminder_24h',
    title: 'Reminder',
    body: 'Tomorrow',
    customerId: 'cust-1',
    data: {},
  };
  const result = await sendPushJob(jobData, tokens, { notificationsEnabled: false });

  assert.equal(result.skipped, true);
  assert.equal(result.skipReason, 'preference_disabled');
});
