import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { defineString } from 'firebase-functions/params';
import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import {
  buildAdminAppointmentCreatedJob,
  buildAppointmentApprovedJobs,
  buildAppointmentCancelledJob,
  buildWaitingListAvailableJob,
  buildPushJobsForApproval,
  buildPushJobForCancellation,
  buildPushJobForWaitlistMatch,
  LEGACY_WHATSAPP_JOBS_ENABLED,
} from './notifications/notificationJobs.js';
import { NotificationJobService } from './notifications/notificationService.js';
import { BLOCKING_STATUSES, overlaps } from './scheduling.js';
export {
  createWebCustomTokenFromNativeAuth,
} from './auth.js';
export {
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

    if (after.status === 'confirmed') {
      // Legacy WhatsApp jobs — only enqueue when explicitly enabled
      if (LEGACY_WHATSAPP_JOBS_ENABLED) {
        jobsToEnqueue.push(...buildAppointmentApprovedJobs(appointmentId, after));
      }
      // Push notification jobs (Phase 1) — approval + 24h + 2h reminders
      jobsToEnqueue.push(...buildPushJobsForApproval(appointmentId, after));
    }

    if (after.status === 'cancelled') {
      // Legacy WhatsApp jobs
      if (LEGACY_WHATSAPP_JOBS_ENABLED) {
        jobsToEnqueue.push(buildAppointmentCancelledJob(appointmentId, after));
      }
      // Push notification job
      jobsToEnqueue.push(buildPushJobForCancellation(appointmentId, after));
    }

    if (jobsToEnqueue.length > 0) {
      await notificationJobs.enqueue(jobsToEnqueue.filter(Boolean));
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
    const available = await slotIsStillAvailable(appointmentId, after);
    if (!available) return;

    const snapshot = await getFirestore()
      .collection('waitingList')
      .where('date', '==', after.date)
      .where('status', '==', 'active')
      .get();

    const matching = snapshot.docs
      .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }))
      .filter((entry) => waitingListMatches(entry, after));

    if (matching.length === 0) return;

    // Legacy WhatsApp jobs
    const legacyJobs = LEGACY_WHATSAPP_JOBS_ENABLED
      ? matching.map((entry) => buildWaitingListAvailableJob(entry.id, appointmentId, entry, after))
      : [];
    // Push notification jobs (Phase 1)
    const pushJobs = matching.map((entry) =>
      buildPushJobForWaitlistMatch(entry.id, appointmentId, entry, after));

    await notificationJobs.enqueue([...legacyJobs, ...pushJobs].filter(Boolean));

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
