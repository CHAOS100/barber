export const ACTIVE_APPOINTMENT_STATUSES = new Set(['pending', 'approved', 'confirmed']);

export const isCustomerBlocked = (customer) =>
  customer?.blocked === true || customer?.isBlocked === true;

export const findActiveCustomerAppointment = (appointments) =>
  appointments.find((appointment) => ACTIVE_APPOINTMENT_STATUSES.has(appointment.status)) || null;
