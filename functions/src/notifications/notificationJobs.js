import { DateTime } from 'luxon';

export const NOTIFICATION_CHANNEL = 'whatsapp';
export const NOTIFICATION_STATUS = 'pending';

const normalizeWhatsAppPhone = (phone) => {
  const value = String(phone || '').replace(/[^\d+]/g, '');
  if (/^05\d{8}$/.test(value)) return `+972${value.slice(1)}`;
  if (/^9725\d{8}$/.test(value)) return `+${value}`;
  if (/^\+9725\d{8}$/.test(value)) return value;
  throw new Error(`Invalid Israeli WhatsApp phone number: ${value || 'missing'}`);
};

const appointmentStart = (appointment) => {
  const start = DateTime.fromFormat(
    `${appointment.date || ''} ${appointment.startTime || ''}`,
    'yyyy-MM-dd HH:mm',
    { zone: 'Asia/Jerusalem' },
  );

  if (!start.isValid) {
    throw new Error(`Invalid appointment schedule: ${appointment.date} ${appointment.startTime}`);
  }

  return start;
};

const job = ({ id, type, phone, appointmentId, scheduledFor, createdAt }) => ({
  id,
  data: {
    type,
    channel: NOTIFICATION_CHANNEL,
    phone: normalizeWhatsAppPhone(phone),
    appointmentId,
    scheduledFor,
    status: NOTIFICATION_STATUS,
    createdAt,
    sentAt: null,
    error: null,
  },
});

export const buildAdminAppointmentCreatedJob = (
  appointmentId,
  adminPhone,
  now = new Date(),
) => job({
  id: `${appointmentId}_admin_created`,
  type: 'appointment_created_admin',
  phone: adminPhone,
  appointmentId,
  scheduledFor: now,
  createdAt: now,
});

export const buildAppointmentApprovedJobs = (
  appointmentId,
  appointment,
  now = new Date(),
) => {
  const start = appointmentStart(appointment);

  return [
    job({
      id: `${appointmentId}_approved`,
      type: 'appointment_approved',
      phone: appointment.customerPhone,
      appointmentId,
      scheduledFor: now,
      createdAt: now,
    }),
    job({
      id: `${appointmentId}_reminder_24h`,
      type: 'appointment_reminder_24h',
      phone: appointment.customerPhone,
      appointmentId,
      scheduledFor: start.minus({ hours: 24 }).toJSDate(),
      createdAt: now,
    }),
    job({
      id: `${appointmentId}_reminder_2h`,
      type: 'appointment_reminder_2h',
      phone: appointment.customerPhone,
      appointmentId,
      scheduledFor: start.minus({ hours: 2 }).toJSDate(),
      createdAt: now,
    }),
  ];
};

export const buildAppointmentCancelledJob = (
  appointmentId,
  appointment,
  now = new Date(),
) => job({
  id: `${appointmentId}_cancelled`,
  type: 'appointment_cancelled',
  phone: appointment.customerPhone,
  appointmentId,
  scheduledFor: now,
  createdAt: now,
});
