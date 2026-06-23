/**
 * Phase 2 push sender.
 *
 * Responsibilities:
 *  1. Look up a customer's enabled FCM tokens from users/{uid}/pushTokens
 *  2. Check notification preferences before sending
 *  3. Call Firebase Admin Messaging
 *  4. Return a structured result (sent / skipped / failed) and a list of
 *     tokens that should be disabled (invalid/unregistered)
 *
 * This module is pure logic with no Firestore writes — the processor
 * handles all Firestore mutations so this stays testable without a live DB.
 */

import { getMessaging } from 'firebase-admin/messaging';

// ── Notification type → preference key mapping ────────────────────────────────

const PREF_KEY_FOR_TYPE = {
  appointment_approved: 'appointmentApprovedEnabled',
  appointment_confirmed: 'appointmentApprovedEnabled',
  appointment_cancelled: 'appointmentCancelledEnabled',
  appointment_reminder_24h: 'reminder24hEnabled',
  appointment_reminder_2h: 'reminder2hEnabled',
  waiting_list_slot_available: 'waitlistAlertsEnabled',
  waiting_list_manual_notify: 'waitlistAlertsEnabled',
  payment_warning: 'paymentWarningsEnabled',
  no_show_payment_required: 'paymentWarningsEnabled',
  admin_message: 'barberMessagesEnabled',
  barber_message: 'barberMessagesEnabled',
  broadcast: 'barberMessagesEnabled',
};

/**
 * Returns true if this job type is allowed by the customer's stored preferences.
 * Missing keys default to true (opt-in by default).
 */
export const isAllowedByPreferences = (jobType, preferences = {}) => {
  if (preferences.notificationsEnabled === false) return false;
  const key = PREF_KEY_FOR_TYPE[jobType];
  if (!key) return true; // unknown type → allow
  return preferences[key] !== false;
};

// ── FCM error codes that mean the token is permanently invalid ────────────────

const UNRECOVERABLE_FCM_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',           // often a bad token format
]);

export const isUnrecoverableFcmError = (errorCode) =>
  UNRECOVERABLE_FCM_CODES.has(errorCode);

// ── Send a single FCM message to one token ────────────────────────────────────

/**
 * Sends one FCM message. Returns { success, messageId?, errorCode?, errorMessage? }.
 */
export const sendToToken = async (token, notification, dataPayload) => {
  const message = {
    token,
    notification: {
      title: notification.title,
      body: notification.body,
    },
    data: dataPayload,
    android: {
      priority: 'high',
      notification: {
        channelId: 'appointments',  // Android O+ channel — must exist on device
        sound: 'default',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
    },
  };

  try {
    const messageId = await getMessaging().send(message);
    return { success: true, messageId };
  } catch (error) {
    return {
      success: false,
      errorCode: error.code || 'unknown',
      errorMessage: error.message || String(error),
    };
  }
};

// ── Build the string-only data payload FCM requires ───────────────────────────

export const buildDataPayload = (jobData) => {
  const raw = {
    type: jobData.type || '',
    appointmentId: jobData.data?.appointmentId || jobData.appointmentId || '',
    date: jobData.data?.date || '',
    startTime: jobData.data?.startTime || '',
    barberId: jobData.data?.barberId || '',
    serviceId: jobData.data?.serviceId || '',
    waitingListId: jobData.data?.waitingListId || '',
    waitingListEntryId: jobData.data?.waitingListEntryId || '',
    customerId: jobData.customerId || '',
  };
  // FCM data values must be strings
  return Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== '').map(([k, v]) => [k, String(v)]),
  );
};

// ── High-level: send one push job to all of a customer's enabled tokens ───────

/**
 * @param {object} jobData      - notificationJob document data
 * @param {object[]} tokens     - array of { id, token, enabled, platform } from pushTokens subcollection
 * @param {object} preferences  - notificationPreferences from the user document (may be undefined)
 *
 * @returns {{
 *   sent: boolean,
 *   skipped: boolean,
 *   skipReason?: string,
 *   successCount: number,
 *   failureCount: number,
 *   tokenResults: Array<{ tokenId: string, token: string, success: boolean, messageId?: string, errorCode?: string, errorMessage?: string }>,
 *   tokensToDisable: string[],  // tokenIds whose FCM tokens are permanently invalid
 * }}
 */
export const sendPushJob = async (jobData, tokens, preferences) => {
  const enabledTokens = tokens.filter((t) => t.enabled !== false && t.token);

  if (enabledTokens.length === 0) {
    return {
      sent: false,
      skipped: true,
      skipReason: 'no_tokens',
      successCount: 0,
      failureCount: 0,
      tokenResults: [],
      tokensToDisable: [],
    };
  }

  if (!isAllowedByPreferences(jobData.type, preferences)) {
    return {
      sent: false,
      skipped: true,
      skipReason: 'preference_disabled',
      successCount: 0,
      failureCount: 0,
      tokenResults: [],
      tokensToDisable: [],
    };
  }

  const notification = { title: jobData.title, body: jobData.body };
  const dataPayload = buildDataPayload(jobData);
  const tokenResults = [];
  const tokensToDisable = [];
  let successCount = 0;
  let failureCount = 0;

  for (const { id: tokenId, token } of enabledTokens) {
    const result = await sendToToken(token, notification, dataPayload);
    tokenResults.push({ tokenId, token, ...result });

    if (result.success) {
      successCount += 1;
    } else {
      failureCount += 1;
      if (isUnrecoverableFcmError(result.errorCode)) {
        tokensToDisable.push(tokenId);
      }
    }
  }

  return {
    sent: successCount > 0,
    skipped: false,
    successCount,
    failureCount,
    tokenResults,
    tokensToDisable,
  };
};
