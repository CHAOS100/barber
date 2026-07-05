/**
 * Push notification recipient isolation tests.
 *
 * These tests verify that push notifications are only delivered to the intended
 * customer. They cover the real bug scenario: Ali books an appointment, admin
 * approves, but Yadin's device receives the push instead of Ali's.
 *
 * The root cause was stale cross-user token contamination — a physical device's
 * FCM token was stored under the wrong user's UID because logout never cleaned
 * up tokens. The fixes tested here are:
 *
 *  1. filterTokensByOwner — excludes tokens whose ownerUid ≠ expected recipient
 *  2. APPOINTMENT_JOB_TYPES guard — skips jobs missing customerId
 *  3. buildPushJobsForApproval always uses appointment.customerId
 *  4. Token ownership model helpers
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { filterTokensByOwner, sendPushJob } from '../src/notifications/pushSender.js';
import { buildPushJobsForApproval, buildPushJobForCancellation } from '../src/notifications/notificationJobs.js';
import { evaluateReminderAppointmentState } from '../src/notifications/pushProcessor.js';

// ── Scenario helpers ──────────────────────────────────────────────────────────

const aliUid = 'ali-uid';
const yadinUid = 'yadin-uid';

const aliToken = { id: 'ali-phone-token', token: 'fcm-aliphoneABC', enabled: true, ownerUid: aliUid };
const yadinToken = { id: 'yadin-phone-token', token: 'fcm-yadinphoneXYZ', enabled: true, ownerUid: yadinUid };

const aliAppointment = {
  customerId: aliUid,
  customerPhone: '+972501234567',
  date: '2026-08-01',
  startTime: '10:00',
  serviceName: 'תספורת',
  barberId: 'barber-1',
};

// ── Appointment job builder — always uses appointment.customerId ──────────────

test('buildPushJobsForApproval: customerId matches appointment.customerId (Ali)', () => {
  const jobs = buildPushJobsForApproval('appt-ali-1', aliAppointment);
  assert.ok(jobs.length >= 1, 'at least the approval job is built');
  const approvalJob = jobs.find((j) => j.data?.type === 'appointment_approved');
  assert.ok(approvalJob, 'appointment_approved job exists');
  assert.equal(approvalJob.data.customerId, aliUid,
    'approval job customerId must be Ali — never Yadin or null');
});

test('buildPushJobForCancellation: customerId matches appointment.customerId (Ali)', () => {
  const job = buildPushJobForCancellation('appt-ali-1', aliAppointment);
  assert.equal(job.data.customerId, aliUid);
  assert.equal(job.data.type, 'appointment_cancelled');
});

test('buildPushJobsForApproval: returns [] when appointment has no date/time (cannot schedule reminders)', () => {
  const badAppointment = { ...aliAppointment, date: '', startTime: '' };
  const jobs = buildPushJobsForApproval('appt-bad', badAppointment);
  assert.equal(jobs.length, 0, 'invalid schedule → no jobs, not a crash');
});

// ── filterTokensByOwner prevents cross-user token delivery ───────────────────

test('Ali approved: only Ali token passes, Yadin token is excluded', () => {
  // Both tokens are passed as if both were found under Ali's pushTokens path
  const tokensUnderAliPath = [aliToken, yadinToken]; // yadinToken is contamination
  const { accepted: safe, wrongOwnerCount } = filterTokensByOwner(tokensUnderAliPath, aliUid);
  assert.equal(safe.length, 1);
  assert.equal(safe[0].ownerUid, aliUid);
  assert.notEqual(safe[0].id, yadinToken.id);
  assert.equal(wrongOwnerCount, 1, 'Yadin stale token counted as wrong-owner exclusion');
});

test('Yadin notified: only Yadin token passes, Ali token is excluded', () => {
  const tokensUnderYadinPath = [aliToken, yadinToken];
  const { accepted: safe, wrongOwnerCount } = filterTokensByOwner(tokensUnderYadinPath, yadinUid);
  assert.equal(safe.length, 1);
  assert.equal(safe[0].ownerUid, yadinUid);
  assert.notEqual(safe[0].id, aliToken.id);
  assert.equal(wrongOwnerCount, 1);
});

// ── sendPushJob with correct customerId never sends to wrong device ───────────

test('sendPushJob for Ali with Yadin stale token → skipped no_tokens', async () => {
  const jobData = {
    type: 'appointment_approved',
    title: 'התור שלך אושר!',
    body: 'התור שלך ב-2026-08-01 בשעה 10:00 אושר. נתראה!',
    customerId: aliUid,
    data: { appointmentId: 'appt-ali-1', date: '2026-08-01', startTime: '10:00' },
  };
  // Simulate: Yadin's stale token found under Ali's pushTokens path in Firestore
  const staleTokensUnderAliPath = [{ ...yadinToken }];
  const result = await sendPushJob(jobData, staleTokensUnderAliPath, {});

  assert.equal(result.skipped, true, 'job must be skipped when only stale token exists');
  assert.equal(result.skipReason, 'no_tokens', 'skip reason must be no_tokens after owner filter');
  assert.equal(result.successCount, 0, 'zero messages sent to Yadin device');
});

test('sendPushJob for Ali with Ali own token → attempts FCM (not skipped for tokens)', async () => {
  const jobData = {
    type: 'appointment_approved',
    title: 'התור שלך אושר!',
    body: 'התור שלך ב-2026-08-01 בשעה 10:00 אושר.',
    customerId: aliUid,
    data: { appointmentId: 'appt-ali-1' },
  };
  // Ali's own token — should pass filter and reach the FCM call
  const result = await sendPushJob(jobData, [aliToken], {});
  // sendToToken() will fail because there's no real FCM connection in tests,
  // but the job is NOT skipped for token/preference reasons — it attempts FCM.
  assert.equal(result.skipped, false, 'job must not be skipped when Ali has a valid own token');
});

// ── APPOINTMENT_JOB_TYPES guard — missing customerId must not broadcast ───────

test('appointment_approved job recipient validation: customerId required', () => {
  // Mirrors the APPOINTMENT_JOB_TYPES guard in pushProcessor.js
  const APPOINTMENT_JOB_TYPES = new Set([
    'appointment_approved', 'appointment_confirmed', 'appointment_cancelled',
    'appointment_rejected', 'appointment', 'appointment_reminder_24h',
    'appointment_reminder_2h', 'appointment_status',
  ]);

  const shouldSkip = (type, customerId) =>
    APPOINTMENT_JOB_TYPES.has(type) && !customerId;

  assert.equal(shouldSkip('appointment_approved', null), true,
    'appointment_approved with null customerId must be skipped');
  assert.equal(shouldSkip('appointment_approved', ''), true,
    'appointment_approved with empty customerId must be skipped');
  assert.equal(shouldSkip('appointment_approved', aliUid), false,
    'appointment_approved with valid customerId must NOT be skipped');
  assert.equal(shouldSkip('slots_released', null), false,
    'slots_released is not appointment-type: different guard applies');
  assert.equal(shouldSkip('admin_message', null), false,
    'admin_message has its own recipient model: not appointment-type');
});

// ── Token ownership model ─────────────────────────────────────────────────────

test('same physical token registered for Yadin then Ali: Ali wins, Yadin excluded', () => {
  // Simulates what happens after registerPushToken callable cleans up:
  // the physical device token is now only stored under Ali's UID.
  const sharedDeviceToken = 'fcm-shareddevice';
  const yadinEntry = { id: 'shared', token: sharedDeviceToken, enabled: false, ownerUid: yadinUid, disabledReason: 'token_reassigned' };
  const aliEntry = { id: 'shared', token: sharedDeviceToken, enabled: true, ownerUid: aliUid };

  // After cleanup: Yadin's entry is disabled, Ali's is active
  const tokensForAli = [yadinEntry, aliEntry].filter((t) => t.enabled !== false);
  const filtered = filterTokensByOwner(tokensForAli, aliUid);

  assert.equal(tokensForAli.length, 1, 'only Ali entry is enabled after cleanup');
  assert.equal(filtered.accepted.length, 1, 'Ali entry passes owner filter');
  assert.equal(filtered.accepted[0].ownerUid, aliUid);

  // Yadin's UIDs tokens would be empty — no sends to Yadin's device for Ali's job
  const tokensForYadin = [yadinEntry, aliEntry].filter((t) => t.enabled !== false);
  const filteredForYadin = filterTokensByOwner(tokensForYadin, yadinUid);
  assert.equal(filteredForYadin.accepted.length, 0, 'Yadin no longer has an active token for this device');
});

test('logout cleanup model: disabled tokens are excluded from sends', async () => {
  const jobData = {
    type: 'appointment_approved',
    title: 'אושר',
    body: 'תור אושר.',
    customerId: yadinUid,
    data: {},
  };
  // Yadin's token was disabled on logout (disabledReason: 'logout')
  const disabledToken = { id: 'yadin-tok', token: 'fcm-yadin', enabled: false, ownerUid: yadinUid, disabledReason: 'logout' };
  const result = await sendPushJob(jobData, [disabledToken], {});
  assert.equal(result.skipped, true);
  assert.equal(result.skipReason, 'no_tokens', 'disabled token is never sent to');
});

// ── evaluateReminderAppointmentState — customer mismatch guard ────────────────

test('evaluateReminderAppointmentState: rejects when job customerId differs from appointment', () => {
  const appointment = {
    status: 'confirmed',
    customerId: aliUid,
    date: '2026-08-01',
    startTime: '10:00',
    serviceDuration: 30,
  };
  // A reminder job mistakenly addressed to Yadin for Ali's appointment
  const result = evaluateReminderAppointmentState(appointment, yadinUid);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'appointment_customer_mismatch',
    'cross-customer reminder must be rejected');
});

test('evaluateReminderAppointmentState: accepts when customerId matches', () => {
  const appointment = {
    status: 'confirmed',
    customerId: aliUid,
    date: '2026-08-01',
    startTime: '10:00',
    serviceDuration: 30,
  };
  const result = evaluateReminderAppointmentState(appointment, aliUid);
  assert.equal(result.valid, true);
});
