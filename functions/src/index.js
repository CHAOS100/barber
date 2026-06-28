import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { defineString } from 'firebase-functions/params';
import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import {
  buildAdminAppointmentCreatedJob,
  buildAppointmentApprovedJobs,
  buildAppointmentCancelledJob,
  buildWaitingListAvailableJob,
  buildPushJobsForApproval,
  buildPushJobForAdminMessage,
  buildPushJobForAppointmentEvent,
  buildPushJobForCancellation,
  buildPushJobForWaitlistMatch,
  buildPushJobForProfileStatus,
  buildPushJobForSlotsReleased,
  LEGACY_WHATSAPP_JOBS_ENABLED,
} from './notifications/notificationJobs.js';
import { NotificationJobService } from './notifications/notificationService.js';
import { processPendingPushJobs, processImmediatePushJobs, IMMEDIATE_PUSH_TYPES } from './notifications/pushProcessor.js';
import { BLOCKING_STATUSES, overlaps } from './scheduling.js';
export {
  createWebCustomTokenFromNativeAuth,
} from './auth.js';
export {
  archiveAdminAppointment,
  batchArchiveAdminAppointments,
  createAdminAppointment,
  createCustomerAppointment,
  deleteAdminAppointment,
  replaceCustomerAppointment,
  updateAdminAppointment,
  updateOwnAppointment,
} from './appointments.js';
export {
  completeCustomerLogin,
  registerCustomerProfile,
} from './customerProfiles.js';
export {
  createAdminReview,
  createCustomerReview,
  deleteAdminReview,
  setAdminReviewStatus,
} from './reviews.js';
export {
  syncCustomerActiveAppointmentLock,
  syncCustomerAppointmentStats,
  syncCustomerReviewStats,
} from './customerStats.js';
export {
  createCustomerWaitingListEntry,
  manualNotifyWaitingListEntry,
} from './waitingList.js';

initializeApp();

const ADMIN_WHATSAPP_PHONE = defineString('ADMIN_WHATSAPP_PHONE', { default: '' });
const notificationJobs = new NotificationJobService(getFirestore());

const pushDebug = (message, details = {}) => {
  console.log('[PUSH_DEBUG]', message, details);
};

const pushRemindersEnabled = async () => {
  try {
    const snapshot = await getFirestore().doc('settings/business').get();
    const data = snapshot.exists ? snapshot.data() : {};
    const enabled = data?.automaticPushRemindersEnabled !== false;
    pushDebug('admin push reminder setting loaded', { enabled });
    return enabled;
  } catch (error) {
    logger.warn('Push reminder setting lookup failed; defaulting to enabled', {
      error: error.message,
    });
    return true;
  }
};

const TERMINAL_APPOINTMENT_STATUSES = new Set(['completed', 'cancelled', 'rejected', 'no_show']);

const appointmentNotificationConfig = (status) => {
  const configs = {
    confirmed: {
      severity: 'success',
      title: 'התור אושר',
      message: 'התור שלך אושר על ידי העסק. נתראה!',
    },
    cancelled: {
      severity: 'warning',
      title: 'התור בוטל',
      message: 'התור שלך בוטל. ניתן לקבוע תור חדש באפליקציה.',
    },
    rejected: {
      severity: 'warning',
      title: 'התור נדחה',
      message: 'התור שביקשת נדחה. ניתן לבחור מועד אחר באפליקציה.',
    },
    completed: {
      severity: 'success',
      title: 'התור הושלם',
      message: 'התור שלך הושלם. תודה שבחרת OST BARBER.',
    },
    no_show: {
      severity: 'danger',
      title: 'סומן אי הגעה',
      message: 'התור סומן כאי הגעה. לפרטים נוספים פנה לעסק.',
    },
  };
  return configs[status] || null;
};

const createAppointmentInAppNotification = async (appointmentId, appointment) => {
  const customerId = appointment.customerId || null;
  const config = appointmentNotificationConfig(appointment.status);
  if (!customerId || !config) return;

  await getFirestore()
    .collection('customerNotifications')
    .doc(customerId)
    .collection('notifications')
    .add({
      type: 'appointment',
      severity: config.severity,
      title: config.title,
      message: config.message,
      targetType: 'single_customer',
      targetCustomerId: customerId,
      targetPhone: appointment.customerPhone || null,
      status: 'unread',
      source: 'appointment_status',
      appointmentId,
      appointmentStatus: appointment.status,
      date: appointment.date || null,
      startTime: appointment.startTime || null,
      serviceId: appointment.serviceId || null,
      serviceName: appointment.serviceName || null,
      barberId: appointment.barberId || null,
      barberName: appointment.barberName || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: null,
    });
};

const archiveExistingAppointmentInboxNotifications = async (appointmentId, customerId) => {
  if (!appointmentId || !customerId) return;
  const snapshot = await getFirestore()
    .collection('customerNotifications')
    .doc(customerId)
    .collection('notifications')
    .where('appointmentId', '==', appointmentId)
    .get()
    .catch(() => null);
  if (!snapshot || snapshot.empty) return;
  const batch = getFirestore().batch();
  snapshot.docs.forEach((docSnapshot) => {
    if (docSnapshot.data()?.archivedFromInbox === true) return;
    batch.update(docSnapshot.ref, {
      archivedFromInbox: true,
      archivedFromInboxAt: FieldValue.serverTimestamp(),
      archivedFromInboxReason: 'appointment_terminal',
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
};

const skipFutureAppointmentReminders = async (appointmentId, reason = 'appointment_terminal') => {
  const ids = [`${appointmentId}_push_reminder_24h`, `${appointmentId}_push_reminder_2h`];
  const refs = ids.map((id) => getFirestore().collection('notificationJobs').doc(id));
  const snapshots = await getFirestore().getAll(...refs);
  const batch = getFirestore().batch();
  let count = 0;
  snapshots.forEach((snapshot) => {
    const data = snapshot.data();
    if (!snapshot.exists || data?.status !== 'pending') return;
    batch.update(snapshot.ref, {
      status: 'skipped',
      skipReason: reason,
      updatedAt: FieldValue.serverTimestamp(),
    });
    count += 1;
  });
  if (count > 0) await batch.commit();
};

export const queueAdminNotificationForNewAppointment = onDocumentCreated(
  'appointments/{appointmentId}',
  async (event) => {
    // Legacy WhatsApp admin notification — disabled when LEGACY_WHATSAPP_JOBS_ENABLED is false.
    // TODO Phase 2: replace with push notification to admin device.
    if (!LEGACY_WHATSAPP_JOBS_ENABLED) return;

    const adminPhone = ADMIN_WHATSAPP_PHONE.value();
    if (!adminPhone) {
      logger.error('ADMIN_WHATSAPP_PHONE is missing; admin notification was not queued.', {
        appointmentId: event.params.appointmentId,
      });
      return;
    }

    await notificationJobs.enqueue([
      buildAdminAppointmentCreatedJob(event.params.appointmentId, adminPhone),
    ]);
  },
);

export const queueCustomerNotificationsForAppointmentStatus = onDocumentUpdated(
  'appointments/{appointmentId}',
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.status === after.status) return;

    const appointmentId = event.params.appointmentId;
    const jobsToEnqueue = [];

    pushDebug('appointment status trigger fired', {
      appointmentId,
      beforeStatus: before.status || null,
      afterStatus: after.status || null,
      customerId: after.customerId || null,
      targetUserId: after.targetUserId || null,
      customerPhonePresent: Boolean(after.customerPhone),
    });

    // [NOTIFICATION_ROUTE_DEBUG] — trace who the notification will be addressed to
    console.log('[NOTIFICATION_ROUTE_DEBUG]', {
      event: 'appointment_status_change',
      appointmentId,
      appointmentOwnerCustomerId: after.customerId || null,
      appointmentOwnerPhone: after.customerPhone || null,
      notificationRecipientCustomerId: after.customerId || null,
      notificationRecipientPhone: after.customerPhone || null,
      inboxPath: after.customerId ? `customerNotifications/${after.customerId}/notifications` : null,
      pushTokenPath: after.customerId ? `users/${after.customerId}/pushTokens` : null,
      expectedPushJobId: after.status === 'cancelled' ? `${appointmentId}_push_cancelled` : null,
      afterStatus: after.status || null,
    });

    if (after.status === 'confirmed') {
      // Legacy WhatsApp jobs — only enqueue when explicitly enabled
      if (LEGACY_WHATSAPP_JOBS_ENABLED) {
        jobsToEnqueue.push(...buildAppointmentApprovedJobs(appointmentId, after));
      }
      // Push notification jobs (Phase 1) — approval + 24h + 2h reminders
      const approvalJobs = buildPushJobsForApproval(appointmentId, after);
      const remindersEnabled = await pushRemindersEnabled();
      jobsToEnqueue.push(...(remindersEnabled
        ? approvalJobs
        : approvalJobs.filter((job) => !['appointment_reminder_24h', 'appointment_reminder_2h'].includes(job.data?.type))));
    }

    if (after.status === 'cancelled') {
      // Legacy WhatsApp jobs
      if (LEGACY_WHATSAPP_JOBS_ENABLED) {
        jobsToEnqueue.push(buildAppointmentCancelledJob(appointmentId, after));
      }
      // Push notification job
      jobsToEnqueue.push(buildPushJobForCancellation(appointmentId, after));
    }

    if (after.status === 'rejected') {
      jobsToEnqueue.push(buildPushJobForAppointmentEvent(appointmentId, after, 'rejected'));
    }

    if (after.status === 'completed') {
      jobsToEnqueue.push(buildPushJobForAppointmentEvent(appointmentId, after, 'completed'));
    }

    if (after.status === 'no_show') {
      jobsToEnqueue.push(buildPushJobForAppointmentEvent(appointmentId, after, 'no_show'));
    }

    if (after.customerId && appointmentNotificationConfig(after.status)) {
      if (TERMINAL_APPOINTMENT_STATUSES.has(after.status)) {
        await archiveExistingAppointmentInboxNotifications(appointmentId, after.customerId);
      }
      await createAppointmentInAppNotification(appointmentId, after);
    }

    if (TERMINAL_APPOINTMENT_STATUSES.has(after.status)) {
      await skipFutureAppointmentReminders(appointmentId);
    }

    const validJobs = jobsToEnqueue.filter(Boolean);
    pushDebug('appointment status jobs prepared', {
      appointmentId,
      jobCount: validJobs.length,
      jobs: validJobs.map((job) => ({
        jobId: job.id,
        type: job.data?.type || null,
        channel: job.data?.channel || null,
        customerId: job.data?.customerId || null,
        targetUserId: job.data?.targetUserId || null,
        scheduledFor: job.data?.scheduledFor || null,
      })),
    });
    if (validJobs.length > 0) {
      await notificationJobs.enqueue(validJobs);
      // Immediately deliver push jobs for time-sensitive status events
      const immediateIds = validJobs
        .filter((j) => j.data?.channel === 'push' && IMMEDIATE_PUSH_TYPES.has(j.data?.type))
        .map((j) => j.id);
      pushDebug('appointment status immediate push ids', {
        appointmentId,
        immediateIds,
      });
      if (immediateIds.length > 0) {
        await processImmediatePushJobs(immediateIds).catch((error) =>
          logger.warn('immediate push delivery failed (scheduler will retry)', { error: error.message }),
        );
      }
    }
  },
);

// ── User profile status change → inbox + push ─────────────────────────────────
//
// Fires when admin blocks/unblocks a customer, adds a warning, or sets a
// payment request. Creates an inbox notification and an immediate push job.
// Uses deterministic doc IDs so Firestore at-least-once retries are safe.

const isAlreadyExistsError = (error) => error?.code === 6 || error?.code === 'already-exists';

const createProfileStatusInboxNotification = async (db, uid, type, fields, dedupKey) => {
  const docId = `profile_status_${type}_${dedupKey}`;
  try {
    await db
      .collection('customerNotifications')
      .doc(uid)
      .collection('notifications')
      .doc(docId)
      .create({
        ...fields,
        type,
        targetType: 'single_customer',
        targetCustomerId: uid,
        status: 'unread',
        source: 'profile_status',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: null,
      });
    pushDebug('[INBOX_DEBUG] profile status inbox notification created', { uid, type, docId });
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      pushDebug('[INBOX_DEBUG] profile status inbox notification already exists, skipping', { uid, type, docId });
      return;
    }
    throw error;
  }
};

export const notifyCustomerOnProfileStatusChange = onDocumentUpdated(
  'users/{uid}',
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    const uid = event.params.uid;
    if (!uid || !before || !after) return;
    if (after.role === 'admin') return;

    const now = new Date();
    const dedupKey = after.updatedAt?.toMillis?.() || now.getTime();
    const db = getFirestore();
    const jobsToEnqueue = [];

    pushDebug('profile status trigger fired', {
      uid,
      dedupKey,
      blockedBefore: Boolean(before.blocked),
      blockedAfter: Boolean(after.blocked),
      warningBefore: Number(before.warningCount || 0),
      warningAfter: Number(after.warningCount || 0),
      paymentBefore: Boolean(before.requiresNoShowPayment),
      paymentAfter: Boolean(after.requiresNoShowPayment),
    });

    // ── Blocked ──────────────────────────────────────────────────────────────
    if (!before.blocked && after.blocked) {
      const reason = String(after.blockedReason || 'פנה לעסק לפרטים נוספים.').trim();
      await createProfileStatusInboxNotification(db, uid, 'block', {
        severity: 'danger',
        title: 'החשבון חסום להזמנות',
        message: `חשבונך חסום מקביעת תורים. סיבה: ${reason}`,
      }, `block_${dedupKey}`);
      jobsToEnqueue.push(buildPushJobForProfileStatus(uid, {
        type: 'block',
        title: 'החשבון חסום להזמנות',
        body: `חשבונך חסום מקביעת תורים. סיבה: ${reason}`,
        dedupKey: `block_${dedupKey}`,
      }, now));
    }

    // ── Unblocked ────────────────────────────────────────────────────────────
    if (before.blocked && !after.blocked) {
      await createProfileStatusInboxNotification(db, uid, 'block', {
        severity: 'success',
        title: 'החסימה הוסרה',
        message: 'החסימה הוסרה מחשבונך. ניתן לקבוע תורים שוב.',
      }, `unblock_${dedupKey}`);
      jobsToEnqueue.push(buildPushJobForProfileStatus(uid, {
        type: 'block',
        title: 'החסימה הוסרה',
        body: 'החסימה הוסרה מחשבונך. ניתן לקבוע תורים שוב.',
        dedupKey: `unblock_${dedupKey}`,
      }, now));
    }

    // ── Warning added ────────────────────────────────────────────────────────
    const prevWarnings = Number(before.warningCount || 0);
    const nextWarnings = Number(after.warningCount || 0);
    if (nextWarnings > prevWarnings) {
      const warningLabel = nextWarnings === 1 ? 'אזהרה' : 'אזהרות';
      await createProfileStatusInboxNotification(db, uid, 'warning', {
        severity: 'warning',
        title: 'אזהרה נוספה לחשבון',
        message: `צברת ${nextWarnings} ${warningLabel}. מומלץ להקפיד על הגעה בזמן וביטול מראש.`,
      }, `warning_${dedupKey}`);
      jobsToEnqueue.push(buildPushJobForProfileStatus(uid, {
        type: 'warning',
        title: 'אזהרה חדשה בחשבון',
        body: `צברת ${nextWarnings} ${warningLabel}. מומלץ להקפיד על הגעה בזמן.`,
        dedupKey: `warning_${dedupKey}`,
      }, now));
    }

    // ── Payment request added ────────────────────────────────────────────────
    if (!before.requiresNoShowPayment && after.requiresNoShowPayment) {
      const amount = Number(after.noShowPaymentAmount || 0);
      const amountText = amount > 0 ? ` ₪${amount}` : '';
      await createProfileStatusInboxNotification(db, uid, 'payment_request', {
        severity: 'warning',
        title: 'נדרש תשלום לפני הזמנה חדשה',
        message: amount > 0
          ? `נדרש תשלום של${amountText} עבור אי-הגעה קודמת לפני קביעת תור חדש.`
          : 'נדרש תשלום עבור אי-הגעה קודמת לפני קביעת תור חדש.',
      }, `payment_req_${dedupKey}`);
      jobsToEnqueue.push(buildPushJobForProfileStatus(uid, {
        type: 'payment_request',
        title: 'נדרש טיפול לפני הזמנה חדשה',
        body: amount > 0
          ? `נדרש תשלום של${amountText} עבור אי-הגעה קודמת.`
          : 'נדרש תשלום עבור אי-הגעה קודמת לפני קביעת תור.',
        dedupKey: `payment_req_${dedupKey}`,
      }, now));
    }

    if (jobsToEnqueue.length === 0) return;

    pushDebug('profile status push jobs prepared', {
      uid,
      dedupKey,
      jobCount: jobsToEnqueue.length,
      jobIds: jobsToEnqueue.map((j) => j.id),
    });

    await notificationJobs.enqueue(jobsToEnqueue);
    const immediateIds = jobsToEnqueue
      .filter((j) => IMMEDIATE_PUSH_TYPES.has(j.data?.type))
      .map((j) => j.id);
    if (immediateIds.length > 0) {
      await processImmediatePushJobs(immediateIds).catch((error) =>
        logger.warn('profile status push delivery failed (scheduler will retry)', { error: error.message }),
      );
    }
  },
);

const blockingStatuses = new Set(['pending', 'approved', 'confirmed', 'scheduled']);

const dayPartForTime = (time) => {
  const [hour] = String(time || '').split(':').map(Number);
  if (hour < 12) return 'morning';
  if (hour < 16) return 'noon';
  return 'evening';
};

const waitingListMatches = (entry, appointment) => {
  // barberId must match if the entry specifies one
  if (entry.barberId && entry.barberId !== appointment.barberId) return false;
  if (entry.serviceId && entry.serviceId !== appointment.serviceId) return false;
  const startTime = appointment.startTime || appointment.time;
  if (entry.preferenceType === 'exact_time') return entry.exactTime === startTime;
  if (entry.preferenceType === 'time_range') {
    return (!entry.startTime || startTime >= entry.startTime)
      && (!entry.endTime || startTime <= entry.endTime);
  }
  if (entry.preferenceType === 'day_part') return entry.dayPart === dayPartForTime(startTime);
  return entry.preferenceType === 'whole_day';
};

const buildWaitingListInAppNotification = (entry, appointment, appointmentId) => {
  const startTime = appointment.startTime || appointment.time || entry.availableStartTime || entry.exactTime || '';
  const dateStr = appointment.date || entry.date || null;

  console.log('[NOTIFICATION_ROUTE_DEBUG]', {
    event: 'waiting_list_inbox',
    waitingListEntryId: entry.id,
    appointmentId,
    recipientCustomerId: entry.customerId || null,
    recipientPhone: entry.phoneNumber || null,
    inboxPath: entry.customerId ? `customerNotifications/${entry.customerId}/notifications` : null,
    date: dateStr,
    startTime,
  });

  return {
    type: 'free_slot',
    severity: 'success',
    title: 'התפנה תור',
    message: 'התפנה תור ב־OST BARBER. היכנס עכשיו לשריין מקום.',
    targetType: 'single_customer',
    targetCustomerId: entry.customerId || null,
    targetPhone: entry.phoneNumber || null,
    status: 'unread',
    source: 'waiting_list',
    appointmentId,
    waitingListId: entry.id,
    waitingListEntryId: entry.id,
    date: dateStr,
    startTime: startTime || null,
    availableStartTime: startTime || null,
    serviceId: appointment.serviceId || entry.serviceId || null,
    serviceName: appointment.serviceName || appointment.service_name || entry.serviceName || null,
    barberId: appointment.barberId || entry.barberId || null,
    barberName: appointment.barberName || entry.barberName || null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    expiresAt: null,
  };
};

const slotIsStillAvailable = async (appointmentId, appointment) => {
  const snapshot = await getFirestore()
    .collection('appointments')
    .where('date', '==', appointment.date)
    .where('barberId', '==', appointment.barberId)
    .get();

  return !snapshot.docs.some((docSnapshot) => {
    if (docSnapshot.id === appointmentId) return false;
    const other = docSnapshot.data();
    return BLOCKING_STATUSES.has(other.status) && overlaps(appointment, other, {
      candidateBufferBeforeMinutes: appointment.bufferBeforeMinutes || 0,
      candidateBufferAfterMinutes: appointment.bufferAfterMinutes || 0,
      existingBufferBeforeMinutes: other.bufferBeforeMinutes || 0,
      existingBufferAfterMinutes: other.bufferAfterMinutes || 0,
    });
  });
};

export const syncAppointmentAvailabilityBlock = onDocumentWritten(
  'appointments/{appointmentId}',
  async (event) => {
    const blockRef = getFirestore().doc(`appointmentBlocks/${event.params.appointmentId}`);
    const appointment = event.data.after.exists ? event.data.after.data() : null;

    if (!appointment || !appointment.barberId || !blockingStatuses.has(appointment.status)) {
      await blockRef.delete();
      return;
    }

    await blockRef.set({
      appointmentId: event.params.appointmentId,
      barberId: appointment.barberId,
      date: appointment.date,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      bufferBeforeMinutes: Math.max(0, Number(appointment.bufferBeforeMinutes || 0)),
      bufferAfterMinutes: Math.max(0, Number(appointment.bufferAfterMinutes || 0)),
      status: appointment.status,
      updatedAt: appointment.updatedAt || appointment.createdAt || FieldValue.serverTimestamp(),
    });
  },
);

export const notifyWaitingListForFreedAppointment = onDocumentUpdated(
  'appointments/{appointmentId}',
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    const wasBlocking = before && blockingStatuses.has(before.status);
    const isFreed = ['cancelled', 'rejected'].includes(after.status);
    if (!wasBlocking || !isFreed || !after.date || !after.startTime || !after.barberId) return;

    const appointmentId = event.params.appointmentId;
    pushDebug('waiting list freed appointment trigger fired', {
      appointmentId,
      beforeStatus: before.status || null,
      afterStatus: after.status || null,
      date: after.date || null,
      startTime: after.startTime || null,
      barberId: after.barberId || null,
    });
    const available = await slotIsStillAvailable(appointmentId, after);
    if (!available) {
      pushDebug('waiting list freed slot not available after conflict check', {
        appointmentId,
      });
      return;
    }

    const snapshot = await getFirestore()
      .collection('waitingList')
      .where('date', '==', after.date)
      .where('status', '==', 'active')
      .get();

    const matching = snapshot.docs
      .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }))
      .filter((entry) => waitingListMatches(entry, after));

    pushDebug('waiting list matching entries checked', {
      appointmentId,
      activeEntriesForDate: snapshot.size,
      matchingCount: matching.length,
      matchingIds: matching.map((entry) => entry.id),
    });

    if (matching.length === 0) return;

    // Legacy WhatsApp jobs
    const legacyJobs = LEGACY_WHATSAPP_JOBS_ENABLED
      ? matching.map((entry) => buildWaitingListAvailableJob(entry.id, appointmentId, entry, after))
      : [];
    // Push notification jobs (Phase 1)
    const pushJobs = matching.map((entry) =>
      buildPushJobForWaitlistMatch(entry.id, appointmentId, entry, after));

    const allJobs = [...legacyJobs, ...pushJobs].filter(Boolean);
    pushDebug('waiting list push jobs prepared', {
      appointmentId,
      jobCount: allJobs.length,
      jobs: allJobs.map((job) => ({
        jobId: job.id,
        type: job.data?.type || null,
        channel: job.data?.channel || null,
        customerId: job.data?.customerId || null,
      })),
    });
    await notificationJobs.enqueue(allJobs);

    // Immediately deliver waitlist push alerts — these are real-time, not scheduled
    const immediateWaitlistIds = pushJobs
      .filter((j) => j && IMMEDIATE_PUSH_TYPES.has(j.data?.type))
      .map((j) => j.id);
    if (immediateWaitlistIds.length > 0) {
      pushDebug('waiting list immediate push ids', {
        appointmentId,
        immediateWaitlistIds,
      });
      await processImmediatePushJobs(immediateWaitlistIds).catch((error) =>
        logger.warn('immediate waitlist push delivery failed (scheduler will retry)', { error: error.message }),
      );
    }

    const batch = getFirestore().batch();
    matching.forEach((entry) => {
      const dateStr = after.date || entry.date || '';
      const timeStr = after.startTime || '';
      const jobId = `waiting_list_slot_available_${entry.id}_${dateStr}_${timeStr}`;
      batch.update(getFirestore().doc(`waitingList/${entry.id}`), {
        status: 'notified',
        notifiedAt: FieldValue.serverTimestamp(),
        notificationJobId: jobId,
        closedReason: 'slot_available_notified',
        updatedAt: FieldValue.serverTimestamp(),
        availableAppointmentId: appointmentId,
        availableStartTime: after.startTime,
      });
      if (entry.customerId) {
        const notificationRef = getFirestore()
          .collection('customerNotifications')
          .doc(entry.customerId)
          .collection('notifications')
          .doc();
        batch.set(notificationRef, buildWaitingListInAppNotification(entry, after, appointmentId));
      }
    });
    await batch.commit();
  },
);

// ── Push notification sender — Phase 2 ───────────────────────────────────────

/**
 * Scheduled function that runs every 5 minutes and processes any pending push
 * notification jobs whose scheduledFor timestamp has passed.
 *
 * Idempotent: jobs are updated to 'sent' or 'skipped' after processing so they
 * will not be picked up again.
 */
export const scheduledPushNotificationSender = onSchedule(
  { schedule: 'every 5 minutes', timeZone: 'Asia/Jerusalem' },
  async () => {
    const summary = await processPendingPushJobs();
    logger.info('scheduledPushNotificationSender: done', summary);
  },
);

/**
 * Admin-only callable function for manually triggering push job processing.
 * Use this to test without waiting for the scheduler.
 *
 * Call via Firebase CLI:
 *   firebase functions:call processPendingPushNotifications --project ost-barber-app
 *
 * Or from the Firebase console, or from the app with an admin Auth token.
 *
 * Returns a summary: { jobsChecked, jobsSent, jobsSkipped, jobsFailed, tokensDisabled, errors }
 */
export const processPendingPushNotifications = onCall(
  { enforceAppCheck: false },
  async (request) => {
    // Verify caller is a signed-in admin
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }
    const adminSnap = await getFirestore()
      .collection('admins')
      .doc(request.auth.uid)
      .get();
    if (!adminSnap.exists || adminSnap.data().role !== 'admin' || !adminSnap.data().active) {
      throw new HttpsError('permission-denied', 'Admin access required.');
    }

    const summary = await processPendingPushJobs();
    logger.info('processPendingPushNotifications: manual trigger', { uid: request.auth.uid, summary });
    return summary;
  },
);

const cleanText = (value) => String(value || '').trim();

const normalizeAdminMessagePhone = (phone) => {
  const value = cleanText(phone).replace(/[^\d+]/g, '');
  if (/^05\d{8}$/.test(value)) return `+972${value.slice(1)}`;
  if (/^5\d{8}$/.test(value)) return `+972${value}`;
  if (/^9725\d{8}$/.test(value)) return `+${value}`;
  if (/^\+9725\d{8}$/.test(value)) return value;
  return '';
};

const adminMessageInput = (data = {}) => {
  const title = cleanText(data.title);
  const message = cleanText(data.message);
  if (!title || !message) {
    throw new HttpsError('invalid-argument', 'title and message are required.');
  }
  return {
    type: cleanText(data.type) || 'admin_custom',
    severity: cleanText(data.severity) || 'info',
    targetType: cleanText(data.targetType || data.audience) || 'all_customers',
    targetCustomerId: cleanText(data.targetCustomerId),
    targetPhone: cleanText(data.targetPhone),
    title,
    message,
    expiresAt: data.expiresAt || null,
  };
};

const userTargetFromSnapshot = (snapshot) => {
  const data = snapshot.data() || {};
  return {
    customerId: snapshot.id,
    phoneNumber: data.phoneNumber || data.phone || null,
    name: cleanText(data.name || `${data.firstName || ''} ${data.lastName || ''}`),
  };
};

const resolveAdminMessageTargets = async (input) => {
  const firestore = getFirestore();

  if (input.targetType === 'single_customer') {
    const snapshot = await firestore.collection('users').doc(input.targetCustomerId).get();
    if (!snapshot.exists || snapshot.data()?.role !== 'customer') return [];
    return [userTargetFromSnapshot(snapshot)];
  }

  if (input.targetType === 'phone') {
    const normalizedPhone = normalizeAdminMessagePhone(input.targetPhone);
    if (!normalizedPhone) return [];
    const snapshot = await firestore.collection('users')
      .where('phoneNumber', '==', normalizedPhone)
      .limit(2)
      .get();
    return snapshot.docs.map(userTargetFromSnapshot);
  }

  if (input.targetType === 'future_appointments') {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const snapshot = await firestore.collection('appointments')
      .where('date', '>=', today)
      .get();
    const activeFutureStatuses = new Set(['approved', 'confirmed', 'scheduled']);
    const customerIds = [...new Set(snapshot.docs
      .filter((item) => activeFutureStatuses.has(item.data().status))
      .map((item) => item.data().customerId)
      .filter(Boolean))];
    const users = await Promise.all(customerIds.map((id) => firestore.collection('users').doc(id).get()));
    return users.filter((snapshot) => snapshot.exists).map(userTargetFromSnapshot);
  }

  if (input.targetType === 'waiting_list') {
    const snapshot = await firestore.collection('waitingList')
      .where('status', '==', 'active')
      .get();
    const customerIds = [...new Set(snapshot.docs.map((item) => item.data().customerId).filter(Boolean))];
    const users = await Promise.all(customerIds.map((id) => firestore.collection('users').doc(id).get()));
    return users.filter((snapshot) => snapshot.exists).map(userTargetFromSnapshot);
  }

  const snapshot = await firestore.collection('users')
    .where('role', '==', 'customer')
    .get();
  return snapshot.docs.map(userTargetFromSnapshot);
};

const createAdminMessageInAppNotifications = async (targets, input, adminUid, messageBatchId) => {
  const firestore = getFirestore();
  let createdCount = 0;
  for (let start = 0; start < targets.length; start += 400) {
    const batch = firestore.batch();
    targets.slice(start, start + 400).forEach((target) => {
      const ref = firestore
        .collection('customerNotifications')
        .doc(target.customerId)
        .collection('notifications')
        .doc();
      batch.set(ref, {
        type: input.type,
        title: input.title,
        message: input.message,
        severity: input.severity,
        targetType: input.targetType,
        targetCustomerId: target.customerId,
        targetPhone: target.phoneNumber || null,
        status: 'unread',
        source: 'admin',
        messageBatchId,
        createdBy: adminUid,
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
      createdCount += 1;
    });
    await batch.commit();
  }
  return createdCount;
};

export const sendAdminCustomerMessage = onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }
    const adminSnap = await getFirestore()
      .collection('admins')
      .doc(request.auth.uid)
      .get();
    if (!adminSnap.exists || adminSnap.data()?.role !== 'admin' || adminSnap.data()?.active !== true) {
      throw new HttpsError('permission-denied', 'Admin access required.');
    }

    const input = adminMessageInput(request.data || {});
    const targets = await resolveAdminMessageTargets(input);
    if (targets.length === 0) {
      throw new HttpsError('failed-precondition', 'No customers matched this audience.');
    }

    const messageBatchId = getFirestore().collection('customerNotificationBatches').doc().id;
    const createdCount = await createAdminMessageInAppNotifications(
      targets,
      input,
      request.auth.uid,
      messageBatchId,
    );

    const pushJobs = targets.map((target) =>
      buildPushJobForAdminMessage(messageBatchId, target, input));
    await notificationJobs.enqueue(pushJobs);

    const immediateIds = pushJobs
      .filter((job) => IMMEDIATE_PUSH_TYPES.has(job.data?.type))
      .map((job) => job.id);
    const pushSummary = immediateIds.length > 0
      ? await processImmediatePushJobs(immediateIds)
      : { jobsChecked: 0, jobsSent: 0, jobsSkipped: 0, jobsFailed: 0 };

    return {
      createdCount,
      pushJobCount: pushJobs.length,
      sentCount: pushSummary?.jobsSent || 0,
      skippedCount: pushSummary?.jobsSkipped || 0,
      failedCount: pushSummary?.jobsFailed || 0,
      messageBatchId,
    };
  },
);

// ── Publish manual slot release — admin callable ──────────────────────────────
//
// Creates one bookingSlotReleases doc per date in the selected range,
// then sends ONE inbox notification + push per customer for the whole batch.
// Replaces the old Firestore trigger (which could create one notification per
// date doc, causing customers to receive 7 duplicates for a week-long release).

const getIsraelToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jerusalem',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

export const generateSlotReleaseDates = (fromDate, toDate, daysOfWeek) => {
  const today = getIsraelToday();
  const dates = [];
  const start = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return dates;
  const filterDays = Array.isArray(daysOfWeek) && daysOfWeek.length > 0
    ? new Set(daysOfWeek.map(Number))
    : null;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    if (dateStr < today) continue;
    if (filterDays && !filterDays.has(d.getUTCDay())) continue;
    dates.push(dateStr);
    if (dates.length >= 90) break;
  }
  return dates;
};

export const publishManualSlotRelease = onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }
    const firestore = getFirestore();
    const adminSnap = await firestore.collection('admins').doc(request.auth.uid).get();
    if (!adminSnap.exists || adminSnap.data()?.role !== 'admin' || adminSnap.data()?.active !== true) {
      throw new HttpsError('permission-denied', 'Admin access required.');
    }

    const data = request.data || {};
    const fromDate = String(data.fromDate || '').trim();
    const toDate = String(data.toDate || '').trim();
    const barberId = String(data.barberId || '').trim();
    const startTime = String(data.startTime || '').trim();
    const endTime = String(data.endTime || '').trim();
    const note = String(data.note || '').trim();
    const daysOfWeek = Array.isArray(data.daysOfWeek) ? data.daysOfWeek : [];

    if (!fromDate || !toDate || !barberId || !startTime || !endTime) {
      throw new HttpsError('invalid-argument', 'fromDate, toDate, barberId, startTime and endTime are required.');
    }
    if (startTime >= endTime) {
      throw new HttpsError('invalid-argument', 'startTime must be before endTime.');
    }

    const dates = generateSlotReleaseDates(fromDate, toDate, daysOfWeek);
    if (dates.length === 0) {
      throw new HttpsError('failed-precondition', 'No valid future dates in the selected range.');
    }
    if (dates.length > 90) {
      throw new HttpsError('invalid-argument', 'Cannot release more than 90 days at once.');
    }

    // Generate a releaseBatchId shared across all docs in this publish action
    const releaseBatchId = firestore.collection('bookingSlotReleaseBatches').doc().id;
    const now = new Date();

    // Check for existing active releases to avoid duplicates; query per date (single field)
    let datesCreated = 0;
    let datesSkipped = 0;
    for (const date of dates) {
      const existingSnap = await firestore
        .collection('bookingSlotReleases')
        .where('date', '==', date)
        .get();
      const alreadyExists = existingSnap.docs.some((doc) => {
        const d = doc.data();
        return d.barberId === barberId
          && d.startTime === startTime
          && d.endTime === endTime
          && d.status === 'active';
      });
      if (alreadyExists) {
        datesSkipped += 1;
        continue;
      }
      await firestore.collection('bookingSlotReleases').add({
        date,
        barberId,
        startTime,
        endTime,
        note,
        status: 'active',
        releaseBatchId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      datesCreated += 1;
    }

    pushDebug('manual slot release batch created', {
      releaseBatchId,
      fromDate,
      toDate,
      barberId,
      startTime,
      endTime,
      datesCreated,
      datesSkipped,
    });

    // Notify ALL customers — one inbox notification + one push per customer per batch
    const customersSnap = await firestore.collection('users').where('role', '==', 'customer').get();
    const customers = customersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    pushDebug('slot release batch notification start', {
      releaseBatchId,
      customerCount: customers.length,
    });

    const pushJobs = [];
    const BATCH_SIZE = 400;
    for (let start = 0; start < customers.length; start += BATCH_SIZE) {
      const writeBatch = firestore.batch();
      customers.slice(start, start + BATCH_SIZE).forEach((customer) => {
        const notifRef = firestore
          .collection('customerNotifications')
          .doc(customer.id)
          .collection('notifications')
          .doc(`slots_released_${releaseBatchId}_${customer.id}`);
        writeBatch.set(notifRef, {
          type: 'slots_released',
          severity: 'success',
          title: 'נפתחו תורים חדשים',
          message: 'נפתחו תורים חדשים ל־OST BARBER. היכנסו לשריין מקום.',
          targetType: 'single_customer',
          targetCustomerId: customer.id,
          targetPhone: customer.phoneNumber || null,
          status: 'unread',
          source: 'manual_slot_release',
          releaseBatchId,
          fromDate,
          toDate,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          expiresAt: null,
        });
        pushJobs.push(buildPushJobForSlotsReleased(customer.id, releaseBatchId, now));
      });
      await writeBatch.commit();
    }

    if (pushJobs.length > 0) {
      await notificationJobs.enqueue(pushJobs);
      const immediateIds = pushJobs
        .filter((j) => IMMEDIATE_PUSH_TYPES.has(j.data?.type))
        .map((j) => j.id);
      if (immediateIds.length > 0) {
        await processImmediatePushJobs(immediateIds).catch((error) =>
          logger.warn('slot release immediate push delivery failed (scheduler will retry)', { error: error.message }),
        );
      }
    }

    return {
      releaseBatchId,
      datesCreated,
      datesSkipped,
      notified: customers.length,
    };
  },
);
