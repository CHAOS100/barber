const ICS_PRODUCT_ID = '-//OST BARBER//Appointments//HE';

const pad = (value) => String(value).padStart(2, '0');

const clean = (value) => String(value || '')
  .replace(/\\/g, '\\\\')
  .replace(/\n/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;')
  .trim();

const dateTimeValue = (date, time) => {
  const [year, month, day] = String(date || '').split('-').map(Number);
  const [hour, minute] = String(time || '00:00').split(':').map(Number);
  if (!year || !month || !day) return '';
  return `${year}${pad(month)}${pad(day)}T${pad(hour || 0)}${pad(minute || 0)}00`;
};

const addMinutesToTime = (time, minutes) => {
  const [hour, minute] = String(time || '00:00').split(':').map(Number);
  const total = Math.max(0, (hour || 0) * 60 + (minute || 0) + Number(minutes || 0));
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
};

const appointmentStartTime = (appointment) => (
  appointment.startTime || appointment.start_time || appointment.time || '00:00'
);

const appointmentEndTime = (appointment) => (
  appointment.endTime
  || appointment.end_time
  || addMinutesToTime(appointmentStartTime(appointment), appointment.serviceDuration || appointment.service_duration || 30)
);

const appointmentToEvent = (appointment) => {
  const startTime = appointmentStartTime(appointment);
  const endTime = appointmentEndTime(appointment);
  const serviceName = appointment.serviceName || appointment.service_name || 'תור';
  const customerName = appointment.customerName || appointment.customer_name || 'לקוח';
  const customerPhone = appointment.customerPhone || appointment.customer_phone || '';
  const barberName = appointment.barberName || appointment.barber_name || '';
  const title = `OST BARBER - ${serviceName} - ${customerName}`;
  const description = [
    customerPhone ? `טלפון: ${customerPhone}` : '',
    barberName ? `ספר: ${barberName}` : '',
    appointment.notes ? `הערות: ${appointment.notes}` : '',
  ].filter(Boolean).join('\n');

  return [
    'BEGIN:VEVENT',
    `UID:ost-barber-${clean(appointment.id)}@ostbarber.app`,
    `DTSTAMP:${dateTimeValue(new Date().toISOString().slice(0, 10), new Date().toTimeString().slice(0, 5))}Z`,
    `DTSTART;TZID=Asia/Jerusalem:${dateTimeValue(appointment.date, startTime)}`,
    `DTEND;TZID=Asia/Jerusalem:${dateTimeValue(appointment.date, endTime)}`,
    `SUMMARY:${clean(title)}`,
    `DESCRIPTION:${clean(description)}`,
    'END:VEVENT',
  ].join('\r\n');
};

export const isCalendarExportableAppointment = (appointment) => {
  const status = appointment?.status;
  const date = appointment?.date || '';
  const today = new Date().toISOString().slice(0, 10);
  return ['approved', 'confirmed', 'scheduled'].includes(status) && date >= today;
};

export const buildAppointmentsIcs = (appointments) => {
  const events = appointments
    .filter(isCalendarExportableAppointment)
    .map(appointmentToEvent);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${ICS_PRODUCT_ID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:OST BARBER',
    'X-WR-TIMEZONE:Asia/Jerusalem',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
};

export const downloadAppointmentsIcs = (appointments, fileName = 'ost-barber-calendar.ics') => {
  const exportable = appointments.filter(isCalendarExportableAppointment);
  if (exportable.length === 0) return 0;
  const blob = new Blob([buildAppointmentsIcs(exportable)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return exportable.length;
};
