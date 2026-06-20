export const ACTIVE_APPOINTMENT_STATUSES = new Set(['pending', 'approved', 'confirmed', 'scheduled']);

export const isCustomerBlocked = (customer) =>
  customer?.blocked === true || customer?.isBlocked === true;

export const hasActivePaymentRequest = (customer) =>
  customer?.requiresNoShowPayment === true
  || customer?.requires_no_show_payment === true
  || Number(customer?.noShowPaymentAmount ?? customer?.no_show_payment_amount ?? 0) > 0;

export const findActiveCustomerAppointment = (appointments) =>
  appointments.find((appointment) => ACTIVE_APPOINTMENT_STATUSES.has(appointment.status)) || null;
