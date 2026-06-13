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
} from './notifications/notificationJobs.js';
import { NotificationJobService } from './notifications/notificationService.js';
export {
  createAdminAppointment,
  createCustomerAppointment,
  deleteAdminAppointment,
  updateAdminAppointment,
  updateOwnAppointment,
} from './appointments.js';
export {
  completeCustomerLogin,
  registerCustomerProfile,
} from './customerProfiles.js';

initializeApp();

const ADMIN_WHATSAPP_PHONE = defineString('ADMIN_WHATSAPP_PHONE', { default: '' });
const notificationJobs = new NotificationJobService(getFirestore());

export const queueAdminNotificationForNewAppointment = onDocumentCreated(
  'appointments/{appointmentId}',
  async (event) => {
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

    if (after.status === 'confirmed') {
      await notificationJobs.enqueue(
        buildAppointmentApprovedJobs(event.params.appointmentId, after),
      );
    }

    if (after.status === 'cancelled') {
      await notificationJobs.enqueue([
        buildAppointmentCancelledJob(event.params.appointmentId, after),
      ]);
    }
  },
);

const blockingStatuses = new Set(['pending', 'approved', 'confirmed']);

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
      status: appointment.status,
      updatedAt: appointment.updatedAt || appointment.createdAt || FieldValue.serverTimestamp(),
    });
  },
);
