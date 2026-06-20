const revenueFor = (appointment) => (
  appointment.paid === true ? Number(appointment.servicePrice ?? appointment.service_price ?? 0) : 0
);

const dateString = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const monthString = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const ACTIVE_USAGE_EXCLUDED = new Set(['cancelled', 'rejected', 'deleted']);

export const calculateAdminStats = (appointments, customers, services, reviews, now = new Date()) => {
  const today = dateString(now);
  const month = monthString(now);
  const todayAppointments = appointments.filter((item) => item.date === today);
  const monthAppointments = appointments.filter((item) => String(item.date || '').startsWith(month));
  const byStatus = (status) => appointments.filter((item) => item.status === status).length;
  const warningCount = customers.reduce((total, customer) => {
    const numericWarnings = Number(customer.warningCount ?? customer.warning_count ?? 0);
    const textWarnings = customer.warning || (Array.isArray(customer.warnings) && customer.warnings.length > 0);
    return total + numericWarnings + (numericWarnings === 0 && textWarnings ? 1 : 0);
  }, 0);
  const blockedCustomersCount = customers.filter((customer) => (
    customer.blocked === true || customer.isBlocked === true || customer.is_blocked === true
  )).length;
  const paymentRequiredCustomersCount = customers.filter((customer) => (
    customer.requiresNoShowPayment === true
    || customer.requires_no_show_payment === true
    || Number(customer.noShowPaymentAmount ?? customer.no_show_payment_amount ?? 0) > 0
  )).length;
  const customerNoShowCount = customers.reduce((total, customer) => (
    total + Number(customer.noShowCount ?? customer.no_show_count ?? 0)
  ), 0);

  return {
    revenue: appointments.reduce((total, item) => total + revenueFor(item), 0),
    todayRevenue: todayAppointments.reduce((total, item) => total + revenueFor(item), 0),
    monthRevenue: monthAppointments.reduce((total, item) => total + revenueFor(item), 0),
    todayAppointments: todayAppointments.length,
    pendingAppointments: byStatus('pending'),
    approvedAppointments: byStatus('approved') + byStatus('confirmed'),
    completedAppointments: byStatus('completed'),
    cancelledAppointments: byStatus('cancelled') + byStatus('rejected'),
    noShowAppointments: byStatus('no_show'),
    customersCount: customers.length,
    servicesCount: services.length,
    reviewsCount: reviews.length,
    warningCount,
    blockedCustomersCount,
    paymentRequiredCustomersCount,
    customerNoShowCount,
  };
};

export const buildWeeklyAppointments = (appointments, now = new Date()) =>
  Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (6 - index));
    const key = dateString(date);
    const rows = appointments.filter((item) => item.date === key);
    return {
      day: new Intl.DateTimeFormat('he-IL', { weekday: 'short' }).format(date),
      appointments: rows.length,
      revenue: rows.reduce((total, item) => total + revenueFor(item), 0),
    };
  });

export const buildMonthlyStats = (appointments, now = new Date(), count = 6) =>
  Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    const key = monthString(date);
    const rows = appointments.filter((item) => String(item.date || '').startsWith(key));
    return {
      key,
      month: new Intl.DateTimeFormat('he-IL', { month: 'short' }).format(date),
      revenue: rows.reduce((total, item) => total + revenueFor(item), 0),
      appointments: rows.length,
      customers: new Set(rows.map((item) => item.customerId).filter(Boolean)).size,
      cancellations: rows.filter((item) => ['cancelled', 'rejected'].includes(item.status)).length,
    };
  });

export const buildServiceUsage = (appointments) => {
  const usage = new Map();
  appointments
    .filter((item) => !ACTIVE_USAGE_EXCLUDED.has(item.status))
    .forEach((item) => {
      const name = item.serviceName || item.service_name || 'שירות ללא שם';
      usage.set(name, (usage.get(name) || 0) + 1);
    });
  return [...usage.entries()]
    .map(([name, count]) => ({ name, count, value: count }))
    .sort((left, right) => right.count - left.count);
};

export const buildPeakHours = (appointments) => {
  const counts = new Map();
  appointments.forEach((item) => {
    const hour = String(item.startTime || item.time || '').slice(0, 2);
    if (hour) counts.set(hour, (counts.get(hour) || 0) + 1);
  });
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([hour, count]) => ({ hour, count }));
};
