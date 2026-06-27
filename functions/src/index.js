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

const blockingStatuses = new Set(['pending', 'approved', 'confirmed', 'scheduled']);

const dayPartForTime = (time) => {
  const [hour] = String(time || '').split(':').map(Number);
  if (hour < 12) return 'morning';
  if (hour < 16) return 'noon';
  return 'evening';
};

const waitingListMatches = (entry, appointment) => {
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
  const serviceName = appointment.serviceName || appointment.service_name || entry.serviceName || '';
  const details = [
    appointment.date ? `תאריך ${appointment.date}` : '',
    startTime ? `בשעה ${startTime}` : '',
    serviceName ? `עבור ${serviceName}` : '',
  ].filter(Boolean).join(' ');

  return {
    type: 'free_slot',
    severity: 'success',
    title: 'התפנה תור מתאים',
    message: details
      ? `התפנה תור ב־OST BARBER ${details}. היכנס לאפליקציה כדי לקבוע לפני שמישהו אחר יתפוס.`
      : 'התפנה תור שמתאים לבקשה שלך. היכנס לאפליקציה כדי לבדוק זמינות.',
    targetType: 'single_customer',
    targetCustomerId: entry.customerId || null,
    targetPhone: entry.phoneNumber || null,
    status: 'unread',
    source: 'waiting_list',
    appointmentId,
    waitingListId: entry.id,
    waitingListEntryId: entry.id,
    date: appointment.date || entry.date || null,
    startTime: startTime || null,
    availableStartTime: startTime || null,
    serviceId: appointment.serviceId || entry.serviceId || null,
    serviceName: serviceName || null,
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
      batch.update(getFirestore().doc(`waitingList/${entry.id}`), {
        status: 'notified',
        notifiedAt: FieldValue.serverTimestamp(),
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
