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
import { sendPushJob } from './pushSender.js';

const BATCH_LIMIT = 25;
const MAX_ATTEMPTS = 5;

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
const REMINDER_TYPES = new Set(['appointment_reminder_24h', 'appointment_reminder_2h']);

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
    await inAppRef.set({
      type: 'appointment',
      severity: 'info',
      title: jobData.title || 'תזכורת לתור',
      message: jobData.body || 'יש לך תור בקרוב.',
      targetType: 'single_customer',
      targetCustomerId: customerId,
      targetPhone: jobData.customerPhone || null,
      status: 'unread',
      source: 'reminder',
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
  const tokens = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  pushDebug('token lookup complete', {
    tokenPath,
    tokenCount: tokens.length,
    tokenIds: tokens.map((token) => token.id),
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

    try {
      const [tokens, preferences] = await Promise.all([
        fetchEnabledTokens(firestore, customerId),
        fetchCustomerPreferences(firestore, customerId),
      ]);

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

    try {
      const [tokens, preferences] = await Promise.all([
        fetchEnabledTokens(firestore, customerId),
        fetchCustomerPreferences(firestore, customerId),
      ]);

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
