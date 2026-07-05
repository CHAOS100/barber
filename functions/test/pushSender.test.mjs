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
  filterTokensByOwner,
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
  // Token must have ownerUid matching customerId so it survives the owner filter.
  const tokens = [{ id: 'tok1', token: 'fcm-token-abc', enabled: true, ownerUid: 'cust-1' }];
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
  const tokens = [{ id: 'tok1', token: 'fcm-token-abc', enabled: true, ownerUid: 'cust-1' }];
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

// ── filterTokensByOwner — cross-user contamination guard ─────────────────────

test('filterTokensByOwner: tokens with matching ownerUid pass through', () => {
  const tokens = [
    { id: 'tok1', token: 'fcm-abc', enabled: true, ownerUid: 'ali-uid' },
    { id: 'tok2', token: 'fcm-def', enabled: true, ownerUid: 'ali-uid' },
  ];
  const { accepted, missingOwnerCount, wrongOwnerCount } = filterTokensByOwner(tokens, 'ali-uid');
  assert.equal(accepted.length, 2);
  assert.equal(missingOwnerCount, 0);
  assert.equal(wrongOwnerCount, 0);
});

test('filterTokensByOwner: tokens without ownerUid (legacy) are EXCLUDED for privacy', () => {
  // Legacy tokens with no ownership field cannot prove which user they belong to.
  // Privacy over backward compatibility: skip them to avoid wrong-device delivery.
  const tokens = [
    { id: 'tok1', token: 'fcm-abc', enabled: true },             // no ownerUid — legacy
    { id: 'tok2', token: 'fcm-def', enabled: true, ownerUid: 'ali-uid' }, // owned by Ali
  ];
  const { accepted, missingOwnerCount, wrongOwnerCount } = filterTokensByOwner(tokens, 'ali-uid');
  assert.equal(accepted.length, 1, 'only Ali-owned token accepted; legacy token excluded');
  assert.equal(accepted[0].id, 'tok2', 'the verified Ali token passes');
  assert.equal(missingOwnerCount, 1, 'one token had no ownership field');
  assert.equal(wrongOwnerCount, 0);
});

test('filterTokensByOwner: Yadin token under Ali path is excluded', () => {
  const tokens = [
    { id: 'ali-tok', token: 'fcm-ali', enabled: true, ownerUid: 'ali-uid' },
    { id: 'yadin-tok', token: 'fcm-yadin', enabled: true, ownerUid: 'yadin-uid' },
  ];
  const { accepted, missingOwnerCount, wrongOwnerCount } = filterTokensByOwner(tokens, 'ali-uid');
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].id, 'ali-tok');
  assert.equal(wrongOwnerCount, 1, 'Yadin stale token counts as wrong-owner exclusion');
  assert.equal(missingOwnerCount, 0);
});

test('filterTokensByOwner: null expectedOwnerUid passes all tokens through', () => {
  const tokens = [
    { id: 'tok1', token: 'fcm-abc', enabled: true, ownerUid: 'ali-uid' },
  ];
  assert.equal(filterTokensByOwner(tokens, null).accepted.length, 1);
  assert.equal(filterTokensByOwner(tokens, '').accepted.length, 1);
  assert.equal(filterTokensByOwner([], 'ali-uid').accepted.length, 0);
});

test('filterTokensByOwner isolates Ali tokens from Yadin tokens', () => {
  const aliToken = { id: 'ali-tok', token: 'fcm-alidevice', enabled: true, ownerUid: 'ali-uid' };
  const yadinToken = { id: 'yadin-tok', token: 'fcm-yadindevice', enabled: true, ownerUid: 'yadin-uid' };

  const { accepted: forAli } = filterTokensByOwner([aliToken, yadinToken], 'ali-uid');
  assert.equal(forAli.length, 1);
  assert.equal(forAli[0].ownerUid, 'ali-uid');

  const { accepted: forYadin } = filterTokensByOwner([aliToken, yadinToken], 'yadin-uid');
  assert.equal(forYadin.length, 1);
  assert.equal(forYadin[0].ownerUid, 'yadin-uid');
});

// ── Recipient isolation — appointment approved for Ali never sends to Yadin ───

test('appointment approved for Ali does not send to Yadin token (ownerUid filter)', async () => {
  // Scenario: Yadin physical device token ended up under Ali's pushTokens path.
  // The ownerUid filter must exclude it — Ali's approval must not reach Yadin's device.
  const jobData = {
    type: 'appointment_approved',
    title: 'התור שלך אושר!',
    body: 'התור אושר.',
    customerId: 'ali-uid',
    data: { appointmentId: 'appt-1' },
  };
  const tokens = [
    // Stale cross-user contamination: Yadin's device token under Ali's path
    { id: 'yadin-stale-tok', token: 'fcm-yadindevice', enabled: true, ownerUid: 'yadin-uid' },
  ];
  const result = await sendPushJob(jobData, tokens, {});
  // ownerUid filter removes Yadin's token → no tokens remain → skipped no_tokens
  assert.equal(result.skipped, true);
  assert.equal(result.skipReason, 'no_tokens');
  assert.equal(result.successCount, 0);
});

test('Ali no-token case skips cleanly without any fallback to Yadin', async () => {
  // Ali has zero tokens registered. Must skip with no_tokens — never broadcast.
  const jobData = {
    type: 'appointment_approved',
    title: 'התור שלך אושר!',
    body: 'התור אושר.',
    customerId: 'ali-uid',
    data: { appointmentId: 'appt-1' },
  };
  const result = await sendPushJob(jobData, [], {});
  assert.equal(result.skipped, true);
  assert.equal(result.skipReason, 'no_tokens');
  assert.equal(result.successCount, 0);
});
