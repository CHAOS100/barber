/**
 * Phase 2 push job processor.
 *
 * Queries pending push notificationJobs (channel == 'push', status == 'pending',
 * scheduledFor <= now), sends each one via FCM, and writes the result back to
 * Firestore.
 *
 * Designed to be called from:
 *   - A scheduled Cloud Function (every 5 minutes)
 *   - An admin-only callable function for manual testing
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { filterTokensByOwner, sendPushJob } from './pushSender.js';
import { ACTIVE_APPOINTMENT_STATUSES, isAppointmentPastByEndTime } from '../bookingPolicy.js';

const BATCH_LIMIT = 25;
const MAX_ATTEMPTS = 5;

// Job types that are tied to a specific appointment customer.
// These REQUIRE a customerId. If missing, the job is skipped rather than
// broadcasting to an unintended recipient.
const APPOINTMENT_JOB_TYPES = new Set([
  'appointment_approved',
  'appointment_confirmed',
  'appointment_cancelled',
  'appointment_rejected',
  'appointment',
  'appointment_reminder_24h',
  'appointment_reminder_2h',
  'appointment_status',
  'appointment_created_admin',
]);

const pushDebug = (message, details = {}) => {
  console.log('[PUSH_DEBUG]', message, details);
};

const getTargetUserId = (jobData = {}) => (
  jobData.customerId
  || jobData.targetUserId
  || jobData.userId
  || jobData.recipientId
  || jobData.uid
  || null
);

// Reminder job types that also need an in-app inbox notification when they fire
const REMINDER_TYPES = new Set(['appointment_reminder_24h', 'appointment_reminder_2h', 'haircut_reminder']);

// Reminder types tied to a specific upcoming appointment — must be re-validated against
// the appointment's live status at send time, not just at job-creation time.
const APPOINTMENT_REMINDER_TYPES = new Set(['appointment_reminder_24h', 'appointment_reminder_2h']);

// inbox type override for reminder jobs — haircut_reminder gets its own type, others use 'appointment'
const REMINDER_INBOX_TYPE = {
  appointment_reminder_24h: 'appointment',
  appointment_reminder_2h: 'appointment',
  haircut_reminder: 'haircut_reminder',
};

const createReminderInAppNotification = async (firestore, jobId, jobData) => {
  const customerId = getTargetUserId(jobData);
  if (!customerId) return;
  try {
    const inAppRef = firestore
      .collection('customerNotifications')
      .doc(customerId)
      .collection('notifications')
      .doc(`${jobId}_inbox`);
    const snap = await inAppRef.get();
    if (snap.exists) return;
    const isHaircutReminder = jobData.type === 'haircut_reminder';
    await inAppRef.set({
      type: REMINDER_INBOX_TYPE[jobData.type] || 'appointment',
      severity: isHaircutReminder ? 'success' : 'info',
      title: jobData.title || 'תזכורת לתור',
      message: jobData.body || 'יש לך תור בקרוב.',
      targetType: 'single_customer',
      targetCustomerId: customerId,
      targetPhone: jobData.customerPhone || null,
      status: 'unread',
      source: isHaircutReminder ? 'rebooking_reminder' : 'reminder',
      lastAppointmentId: jobData.data?.lastAppointmentId || null,
      action: jobData.data?.action || null,
      appointmentId: jobData.data?.appointmentId || jobData.appointmentId || null,
      date: jobData.data?.date || null,
      startTime: jobData.data?.startTime || null,
      serviceId: jobData.data?.serviceId || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: null,
      readAt: null,
      readBy: null,
      readByName: null,
      readByPhone: null,
      hiddenAt: null,
      hiddenBy: null,
    });
    pushDebug('[INBOX_DEBUG] reminder in-app notification created', {
      jobId, type: jobData.type, customerId,
    });
  } catch (error) {
    logger.warn('[INBOX_DEBUG] failed to create reminder in-app notification', {
      jobId, error: error.message,
    });
  }
};

// Job types that are immediate (not time-scheduled) — processed inline after enqueue
export const IMMEDIATE_PUSH_TYPES = new Set([
  'appointment_approved',
  'appointment_confirmed',
  'appointment_cancelled',
  'appointment_rejected',
  'appointment',
  'waiting_list_slot_available',
  'waiting_list_manual_notify',
  'payment_warning',
  'warning',
  'block',
  'payment_request',
  'no_show_payment_required',
  'admin_message',
  'barber_message',
  'broadcast',
  'appointment_created_admin',
  'slots_released',
]);

// ── Firestore helpers ─────────────────────────────────────────────────────────

const customerHasFutureAppointment = async (firestore, customerId) => {
  if (!customerId) return false;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const snap = await firestore
      .collection('appointments')
      .where('customerId', '==', customerId)
      .where('date', '>=', today)
      .where('status', 'in', ['pending', 'confirmed'])
      .limit(1)
      .get();
    return !snap.empty;
  } catch {
    return false; // fail open: if check fails, don't skip
  }
};

const fetchEnabledTokens = async (firestore, customerId) => {
  if (!customerId) {
    pushDebug('token lookup skipped: missing target user id', {
      tokenPath: null,
      tokenCount: 0,
    });
    return [];
  }
  const tokenPath = `users/${customerId}/pushTokens`;
  const snap = await firestore
    .collection('users')
    .doc(customerId)
    .collection('pushTokens')
    .where('enabled', '==', true)
    .get();
  const rawTokens = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Defense-in-depth: filter out tokens whose ownerUid doesn't match the
  // requested customerId. This catches stale cross-user token contamination
  // even if the token document ended up under the wrong user's path.
  // Legacy tokens without any ownerUid field are also excluded — privacy over
  // backward compatibility (missing a push is safer than sending to wrong device).
  const { accepted: tokens, missingOwnerCount, wrongOwnerCount } =
    filterTokensByOwner(rawTokens, customerId);
  const filteredOutCount = missingOwnerCount + wrongOwnerCount;

  if (filteredOutCount > 0) {
    logger.warn('[PUSH_RECIPIENT_DEBUG] fetchEnabledTokens: removed stale/unverified tokens', {
      customerId,
      tokenPath,
      rawCount: rawTokens.length,
      missingOwnerCount,
      wrongOwnerCount,
      filteredOutCount,
      acceptedTokenCount: tokens.length,
    });
  }

  pushDebug('[PUSH_RECIPIENT_DEBUG] token lookup complete', {
    tokenPath,
    rawTokenCount: rawTokens.length,
    missingOwnerCount,
    wrongOwnerCount,
    acceptedTokenCount: tokens.length,
    tokenOwnerIds: rawTokens.map((t) => t.ownerUid || 'legacy_no_ownerUid'),
    expectedOwnerId: customerId,
  });
  return tokens;
};

const fetchCustomerPreferences = async (firestore, customerId) => {
  if (!customerId) {
    pushDebug('preferences lookup skipped: missing target user id', {
      userPath: null,
      preferencesPresent: false,
    });
    return {};
  }
  try {
    const snap = await firestore.collection('users').doc(customerId).get();
    const preferences = snap.exists ? (snap.data().notificationPreferences || {}) : {};
    pushDebug('preferences lookup complete', {
      userPath: `users/${customerId}`,
      userExists: snap.exists,
      preferenceKeys: Object.keys(preferences),
    });
    return preferences;
  } catch {
    console.warn('[PUSH_DEBUG]', 'preferences lookup failed, defaulting to allow', {
      userPath: `users/${customerId}`,
    });
    return {};
  }
};

/**
 * Pure decision logic for whether an appointment-bound reminder is still safe to
 * send, given the appointment's live state. Job-creation-time state can go
 * stale: the appointment may since have been cancelled, completed, rejected,
 * marked no-show, or its end time may already have passed.
 *
 * @param {object|null} appointment - the live appointment doc data, or null if not found
 * @param {string|null} jobCustomerId - the customerId the job is addressed to
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
export const evaluateReminderAppointmentState = (appointment, jobCustomerId, now = new Date()) => {
  if (!appointment) {
    return { valid: false, reason: 'appointment_not_found' };
  }
  if (!ACTIVE_APPOINTMENT_STATUSES.has(appointment.status)) {
    return { valid: false, reason: 'appointment_not_active' };
  }
  if (isAppointmentPastByEndTime(appointment, now)) {
    return { valid: false, reason: 'appointment_already_past' };
  }
  if (jobCustomerId && appointment.customerId && jobCustomerId !== appointment.customerId) {
    return { valid: false, reason: 'appointment_customer_mismatch' };
  }
  return { valid: true };
};

const validateAppointmentReminderJob = async (firestore, jobData) => {
  const appointmentId = jobData.data?.appointmentId || jobData.appointmentId || null;
  if (!appointmentId) return { valid: true };

  const snap = await firestore.collection('appointments').doc(appointmentId).get();
  const appointment = snap.exists ? snap.data() : null;
  return evaluateReminderAppointmentState(appointment, getTargetUserId(jobData));
};

const disableToken = async (firestore, customerId, tokenId) => {
  if (!customerId || !tokenId) return;
  try {
    await firestore
      .collection('users')
      .doc(customerId)
      .collection('pushTokens')
      .doc(tokenId)
      .update({ enabled: false, disabledAt: FieldValue.serverTimestamp() });
  } catch (error) {
    logger.warn('pushProcessor: failed to disable stale token', { customerId, tokenId, error: error.message });
  }
};

// ── Job result writers ────────────────────────────────────────────────────────

const markJobSent = (firestore, jobId, attempts) => {
  pushDebug('final job status', { jobId, status: 'sent', attempts: attempts + 1 });
  return firestore.collection('notificationJobs').doc(jobId).update({
    status: 'sent',
    sentAt: FieldValue.serverTimestamp(),
    attempts: attempts + 1,
    lastError: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
};

const markJobSkipped = (firestore, jobId, reason, attempts) => {
  pushDebug('final job status', { jobId, status: 'skipped', skipReason: reason, attempts: attempts + 1 });
  return firestore.collection('notificationJobs').doc(jobId).update({
    status: 'skipped',
    skipReason: reason,
    attempts: attempts + 1,
    updatedAt: FieldValue.serverTimestamp(),
  });
};

const markJobFailed = (firestore, jobId, errorMessage, attempts, permanent) => {
  pushDebug('final job status', {
    jobId,
    status: permanent ? 'failed' : 'pending',
    errorMessage: String(errorMessage || 'unknown'),
    attempts: attempts + 1,
  });
  return firestore.collection('notificationJobs').doc(jobId).update({
    status: permanent ? 'failed' : 'pending',   // keep 'pending' for transient errors
    lastError: String(errorMessage || 'unknown'),
    attempts: attempts + 1,
    updatedAt: FieldValue.serverTimestamp(),
  });
};

// ── Single-job processor (for immediate inline delivery) ──────────────────────

/**
 * Processes a specific set of push notification jobs immediately by ID.
 * Called right after the jobs are enqueued so immediate events (approval,
 * cancellation, waitlist match) reach the device within seconds rather than
 * waiting up to 5 minutes for the scheduler.
 *
 * Duplicate-safe: jobs already 'sent' or 'skipped' are skipped here too.
 *
 * @param {string[]} jobIds   - notificationJob document IDs to process
 */
export const processImmediatePushJobs = async (jobIds) => {
  if (!jobIds || jobIds.length === 0) return;

  const firestore = getFirestore();
  const summary = {
    jobsChecked: 0,
    jobsSent: 0,
    jobsSkipped: 0,
    jobsFailed: 0,
    tokensDisabled: 0,
    errors: [],
  };

  pushDebug('processImmediatePushJobs starts', {
    requestedJobIds: jobIds,
    count: jobIds.length,
  });

  for (const jobId of jobIds) {
    const docRef = firestore.collection('notificationJobs').doc(jobId);
    let doc;
    try {
      doc = await docRef.get();
    } catch (error) {
      logger.warn('processImmediatePushJobs: could not read job', { jobId, error: error.message });
      continue;
    }

    if (!doc.exists) {
      pushDebug('immediate job missing', { jobId });
      continue;
    }

    const jobData = doc.data();
    summary.jobsChecked += 1;
    const customerId = getTargetUserId(jobData);

    pushDebug('immediate job loaded', {
      jobId,
      type: jobData.type || null,
      channel: jobData.channel || null,
      status: jobData.status || null,
      customerId: jobData.customerId || null,
      targetUserId: jobData.targetUserId || null,
      userId: jobData.userId || null,
      recipientId: jobData.recipientId || null,
      resolvedTargetUserId: customerId,
      scheduledFor: jobData.scheduledFor || null,
    });

    // Skip if already processed (scheduler may have beaten us, or job is wrong channel)
    if (jobData.status !== 'pending' || jobData.channel !== 'push') {
      pushDebug('immediate job skipped before send', {
        jobId,
        type: jobData.type || null,
        channel: jobData.channel || null,
        status: jobData.status || null,
      });
      summary.jobsSkipped += 1;
      continue;
    }

    const attempts = Number(jobData.attempts || 0);

    // Strict guard: appointment-type jobs MUST have a customerId.
    // If missing, skip immediately — never broadcast to an unintended recipient.
    if (APPOINTMENT_JOB_TYPES.has(jobData.type) && !customerId) {
      logger.warn('[PUSH_RECIPIENT_DEBUG] immediate job skipped: appointment job missing customerId', {
        jobId,
        type: jobData.type,
        skipReason: 'missing_customer_id',
      });
      await markJobSkipped(firestore, jobId, 'missing_customer_id', attempts);
      summary.jobsSkipped += 1;
      continue;
    }

    if (APPOINTMENT_REMINDER_TYPES.has(jobData.type)) {
      const validation = await validateAppointmentReminderJob(firestore, jobData);
      if (!validation.valid) {
        pushDebug('immediate reminder job failed appointment validation', {
          jobId, type: jobData.type, reason: validation.reason,
        });
        await markJobSkipped(firestore, jobId, validation.reason, attempts);
        summary.jobsSkipped += 1;
        continue;
      }
    }

    try {
      const [tokens, preferences] = await Promise.all([
        fetchEnabledTokens(firestore, customerId),
        fetchCustomerPreferences(firestore, customerId),
      ]);

      console.log('[PUSH_RECIPIENT_DEBUG]', {
        jobId,
        jobType: jobData.type || null,
        resolvedCustomerId: customerId,
        jobCustomerId: jobData.customerId || null,
        targetUserId: jobData.targetUserId || null,
        tokenCount: tokens.length,
        tokenOwnerIds: tokens.map((t) => t.ownerUid || 'legacy_no_ownerUid'),
        skippedReason: null,
      });

      const result = await sendPushJob(jobData, tokens, preferences);
      pushDebug('immediate send result', {
        jobId,
        type: jobData.type || null,
        resolvedTargetUserId: customerId,
        sent: result.sent,
        skipped: result.skipped,
        skipReason: result.skipReason || null,
        successCount: result.successCount,
        failureCount: result.failureCount,
        tokenResults: result.tokenResults.map((item) => ({
          tokenId: item.tokenId,
          success: item.success,
          messageId: item.messageId || null,
          errorCode: item.errorCode || null,
          errorMessage: item.errorMessage || null,
        })),
      });

      if (result.tokensToDisable.length > 0) {
        await Promise.all(
          result.tokensToDisable.map((tokenId) => disableToken(firestore, customerId, tokenId)),
        );
        summary.tokensDisabled += result.tokensToDisable.length;
      }

      if (result.skipped) {
        await markJobSkipped(firestore, jobId, result.skipReason, attempts);
        summary.jobsSkipped += 1;
      } else if (result.sent) {
        await markJobSent(firestore, jobId, attempts);
        summary.jobsSent += 1;
      } else {
        const firstError = result.tokenResults.find((r) => !r.success);
        const errorMsg = firstError?.errorMessage || 'all tokens failed';
        const permanent = attempts + 1 >= MAX_ATTEMPTS;
        await markJobFailed(firestore, jobId, errorMsg, attempts, permanent);
        summary.jobsFailed += 1;
      }
    } catch (error) {
      const message = `job ${jobId}: ${error.message || String(error)}`;
      logger.error('processImmediatePushJobs: unexpected error', { jobId, error: message });
      summary.errors.push(message);
      try {
        await markJobFailed(firestore, jobId, message, attempts, false);
      } catch {
        // best-effort
      }
      summary.jobsFailed += 1;
    }
  }

  if (summary.jobsChecked > 0) {
    logger.info('processImmediatePushJobs: done', summary);
  }
  return summary;
};

// ── Core processor ────────────────────────────────────────────────────────────

/**
 * Processes up to BATCH_LIMIT pending push jobs whose scheduledFor <= now.
 *
 * @returns {{
 *   jobsChecked: number,
 *   jobsSent: number,
 *   jobsSkipped: number,
 *   jobsFailed: number,
 *   tokensDisabled: number,
 *   errors: string[],
 * }}
 */
export const processPendingPushJobs = async () => {
  const firestore = getFirestore();
  const now = new Date();

  pushDebug('processPendingPushJobs starts', {
    now,
    batchLimit: BATCH_LIMIT,
  });

  const snap = await firestore
    .collection('notificationJobs')
    .where('channel', '==', 'push')
    .where('status', '==', 'pending')
    .where('scheduledFor', '<=', now)
    .orderBy('scheduledFor', 'asc')
    .limit(BATCH_LIMIT)
    .get();

  if (snap.empty) {
    pushDebug('processPendingPushJobs query complete', {
      jobsFound: 0,
    });
    logger.info('pushProcessor: no pending push jobs');
    return { jobsChecked: 0, jobsSent: 0, jobsSkipped: 0, jobsFailed: 0, tokensDisabled: 0, errors: [] };
  }

  pushDebug('processPendingPushJobs query complete', {
    jobsFound: snap.docs.length,
    jobIds: snap.docs.map((item) => item.id),
  });

  const summary = {
    jobsChecked: snap.docs.length,
    jobsSent: 0,
    jobsSkipped: 0,
    jobsFailed: 0,
    tokensDisabled: 0,
    errors: [],
  };

  for (const doc of snap.docs) {
    const jobId = doc.id;
    const jobData = doc.data();
    const attempts = Number(jobData.attempts || 0);
    const customerId = getTargetUserId(jobData);

    pushDebug('pending job loaded', {
      jobId,
      type: jobData.type || null,
      channel: jobData.channel || null,
      status: jobData.status || null,
      customerId: jobData.customerId || null,
      targetUserId: jobData.targetUserId || null,
      userId: jobData.userId || null,
      recipientId: jobData.recipientId || null,
      resolvedTargetUserId: customerId,
      scheduledFor: jobData.scheduledFor || null,
      attempts,
    });

    // Safety valve: give up after MAX_ATTEMPTS
    if (attempts >= MAX_ATTEMPTS) {
      await markJobFailed(firestore, jobId, 'max attempts reached', attempts, true);
      summary.jobsFailed += 1;
      continue;
    }

    // Strict guard: appointment-type jobs MUST have a customerId.
    if (APPOINTMENT_JOB_TYPES.has(jobData.type) && !customerId) {
      logger.warn('[PUSH_RECIPIENT_DEBUG] pending job skipped: appointment job missing customerId', {
        jobId,
        type: jobData.type,
        skipReason: 'missing_customer_id',
      });
      await markJobSkipped(firestore, jobId, 'missing_customer_id', attempts);
      summary.jobsSkipped += 1;
      continue;
    }

    // Haircut reminder: skip if customer already has a future booking
    if (jobData.type === 'haircut_reminder' && customerId) {
      const hasFuture = await customerHasFutureAppointment(firestore, customerId);
      if (hasFuture) {
        await markJobSkipped(firestore, jobId, 'already_has_future_appointment', attempts);
        summary.jobsSkipped += 1;
        continue;
      }
    }

    // Appointment-bound reminders (24h/2h): re-validate against the appointment's
    // live status at send time — it may have been cancelled/completed/rejected/
    // marked no-show, or already passed, since the job was created.
    if (APPOINTMENT_REMINDER_TYPES.has(jobData.type)) {
      const validation = await validateAppointmentReminderJob(firestore, jobData);
      if (!validation.valid) {
        pushDebug('pending reminder job failed appointment validation', {
          jobId, type: jobData.type, reason: validation.reason,
        });
        await markJobSkipped(firestore, jobId, validation.reason, attempts);
        summary.jobsSkipped += 1;
        continue;
      }
    }

    try {
      const [tokens, preferences] = await Promise.all([
        fetchEnabledTokens(firestore, customerId),
        fetchCustomerPreferences(firestore, customerId),
      ]);

      console.log('[PUSH_RECIPIENT_DEBUG]', {
        jobId,
        jobType: jobData.type || null,
        resolvedCustomerId: customerId,
        jobCustomerId: jobData.customerId || null,
        targetUserId: jobData.targetUserId || null,
        tokenCount: tokens.length,
        tokenOwnerIds: tokens.map((t) => t.ownerUid || 'legacy_no_ownerUid'),
        skippedReason: null,
      });

      const result = await sendPushJob(jobData, tokens, preferences);
      pushDebug('pending send result', {
        jobId,
        type: jobData.type || null,
        resolvedTargetUserId: customerId,
        sent: result.sent,
        skipped: result.skipped,
        skipReason: result.skipReason || null,
        successCount: result.successCount,
        failureCount: result.failureCount,
        tokenResults: result.tokenResults.map((item) => ({
          tokenId: item.tokenId,
          success: item.success,
          messageId: item.messageId || null,
          errorCode: item.errorCode || null,
          errorMessage: item.errorMessage || null,
        })),
      });

      // Disable stale tokens in parallel — non-blocking for the job result
      if (result.tokensToDisable.length > 0) {
        await Promise.all(
          result.tokensToDisable.map((tokenId) => disableToken(firestore, customerId, tokenId)),
        );
        summary.tokensDisabled += result.tokensToDisable.length;
      }

      if (result.skipped) {
        await markJobSkipped(firestore, jobId, result.skipReason, attempts);
        summary.jobsSkipped += 1;
        // Still create inbox notification for reminders even when push is skipped (no tokens)
        if (REMINDER_TYPES.has(jobData.type) && result.skipReason === 'no_tokens') {
          await createReminderInAppNotification(firestore, jobId, jobData);
        }
        continue;
      }

      if (result.sent) {
        await markJobSent(firestore, jobId, attempts);
        summary.jobsSent += 1;
        if (REMINDER_TYPES.has(jobData.type)) {
          await createReminderInAppNotification(firestore, jobId, jobData);
        }
      } else {
        // All tokens failed — may be transient; keep pending until MAX_ATTEMPTS
        const firstError = result.tokenResults.find((r) => !r.success);
        const errorMsg = firstError?.errorMessage || 'all tokens failed';
        const permanent = attempts + 1 >= MAX_ATTEMPTS;
        await markJobFailed(firestore, jobId, errorMsg, attempts, permanent);
        summary.jobsFailed += 1;
      }

    } catch (error) {
      const message = `job ${jobId}: ${error.message || String(error)}`;
      logger.error('pushProcessor: unexpected error', { jobId, error: message });
      summary.errors.push(message);
      // Don't mark the job failed for unexpected errors — leave it pending
      try {
        await markJobFailed(firestore, jobId, message, attempts, false);
      } catch {
        // best-effort
      }
      summary.jobsFailed += 1;
    }
  }

  logger.info('pushProcessor: batch complete', summary);
  return summary;
};
