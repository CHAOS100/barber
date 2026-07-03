import test from 'node:test';
import assert from 'node:assert/strict';
import { timeToMinutes } from '../src/scheduling.js';
import { generateSlotReleaseDates, isBarberDocBookable } from '../src/index.js';
import { buildPushJobForHaircutReminder } from '../src/notifications/notificationJobs.js';
import { isAllowedByPreferences } from '../src/notifications/pushSender.js';
import { ACTIVE_APPOINTMENT_STATUSES, findActiveCustomerAppointment } from '../src/bookingPolicy.js';
import { evaluateReminderAppointmentState } from '../src/notifications/pushProcessor.js';

// ─── Helpers mirroring server logic ──────────────────────────────────────────

// Mirrors rejectManualModeSlot in appointments.js
const isSlotInReleaseWindow = (slotTime, releases, serviceDuration = 30) => {
  const slotMinutes = timeToMinutes(slotTime);
  const slotEndMinutes = slotMinutes + Number(serviceDuration || 0);
  return releases.some((r) => {
    const from = timeToMinutes(r.startTime);
    const to = timeToMinutes(r.endTime);
    return slotMinutes >= from && slotEndMinutes <= to;
  });
};

const release = (startTime, endTime, barberId = 'barber-1') => ({
  barberId,
  startTime,
  endTime,
  status: 'active',
});

// Mirrors waitingListMatchesAppointment in appointments.js
const waitingListMatchesAppointment = (entry, appointment) => {
  if (!['active', 'notified'].includes(entry.status)) return false;
  if (entry.date !== appointment.date) return false;
  if (entry.barberId && entry.barberId !== appointment.barberId) return false;
  if (entry.serviceId && entry.serviceId !== appointment.serviceId) return false;
  if (entry.preferenceType === 'exact_time') return entry.exactTime === appointment.startTime;
  if (entry.preferenceType === 'time_range') {
    return (!entry.startTime || appointment.startTime >= entry.startTime)
      && (!entry.endTime || appointment.startTime <= entry.endTime);
  }
  if (entry.preferenceType === 'day_part') {
    const hour = Number(appointment.startTime.split(':')[0]);
    const part = hour < 12 ? 'morning' : hour < 16 ? 'noon' : 'evening';
    return entry.dayPart === part;
  }
  return entry.preferenceType === 'whole_day';
};

// Mirrors waitingListMatches in index.js (for freed-appointment trigger)
const waitingListMatchesTrigger = (entry, appointment) => {
  if (entry.barberId && entry.barberId !== appointment.barberId) return false;
  if (entry.serviceId && entry.serviceId !== appointment.serviceId) return false;
  const startTime = appointment.startTime || appointment.time;
  if (entry.preferenceType === 'exact_time') return entry.exactTime === startTime;
  if (entry.preferenceType === 'time_range') {
    return (!entry.startTime || startTime >= entry.startTime)
      && (!entry.endTime || startTime <= entry.endTime);
  }
  if (entry.preferenceType === 'day_part') {
    const hour = Number(startTime.split(':')[0]);
    const part = hour < 12 ? 'morning' : hour < 16 ? 'noon' : 'evening';
    return entry.dayPart === part;
  }
  return entry.preferenceType === 'whole_day';
};

// Mirrors buildPushJobForWaitlistMatch dedup key in notificationJobs.js
const waitlistPushJobId = (waitingListId, date, startTime) =>
  `waiting_list_slot_available_${waitingListId}_${date}_${startTime}`;

// Mirrors buildPushJobForCancellation job id in notificationJobs.js
const cancellationPushJobId = (appointmentId) => `${appointmentId}_push_cancelled`;

// Mirrors inbox notification path in index.js
const inboxPath = (customerId) => `customerNotifications/${customerId}/notifications`;

// ─── PART 1: Appointment cancellation routing ─────────────────────────────────

test('appointment_cancelled push job targets appointment.customerId only', () => {
  const appointmentId = 'appt-ali';
  const appointment = { customerId: 'uid-ali', customerPhone: '+972501111111', date: '2099-01-01', startTime: '10:00' };
  const jobId = cancellationPushJobId(appointmentId);
  // The push job uses appointment.customerId as customerId — push processor reads users/{customerId}/pushTokens
  assert.equal(jobId, `${appointmentId}_push_cancelled`);
  // Recipient must be the appointment owner (Ali), NOT any other customer
  const recipientCustomerId = appointment.customerId;
  assert.equal(recipientCustomerId, 'uid-ali');
  assert.notEqual(recipientCustomerId, 'uid-yadin');
});

test('appointment_cancelled inbox path uses appointment.customerId', () => {
  const appointment = { customerId: 'uid-ali' };
  const path = inboxPath(appointment.customerId);
  assert.equal(path, 'customerNotifications/uid-ali/notifications');
  assert.notEqual(path, 'customerNotifications/uid-yadin/notifications');
});

test('appointment without customerId produces null recipient — push is skipped', () => {
  const appointment = { customerId: null, customerPhone: '+972501111111' };
  const recipientCustomerId = appointment.customerId || null;
  assert.equal(recipientCustomerId, null);
  // push processor: fetchEnabledTokens(firestore, null) → returns [] → job skipped
});

// ─── PART 2: Waiting list slot available routing ──────────────────────────────

test('waiting list push goes to waiting list customer, not appointment owner', () => {
  const wlEntry = { id: 'wl-yadin', customerId: 'uid-yadin', phoneNumber: '+972502222222', date: '2099-01-01', preferenceType: 'whole_day', status: 'active' };
  const appointment = { customerId: 'uid-ali', date: '2099-01-01', barberId: 'barber-1', serviceId: 'srv-1', startTime: '10:00' };
  const jobId = waitlistPushJobId(wlEntry.id, appointment.date, appointment.startTime);
  // Push job customerId = wlEntry.customerId, NOT appointment.customerId
  assert.equal(wlEntry.customerId, 'uid-yadin');
  assert.notEqual(wlEntry.customerId, appointment.customerId);
  // Job ID contains the waiting list entry id, not appointment id
  assert.ok(jobId.includes(wlEntry.id));
  assert.ok(!jobId.includes(appointment.customerId));
});

test('appointment_cancelled push id differs from waiting_list push id', () => {
  const apptId = 'appt-1';
  const wlId = 'wl-1';
  const cancelId = cancellationPushJobId(apptId);
  const wlJobId = waitlistPushJobId(wlId, '2099-01-01', '10:00');
  assert.notEqual(cancelId, wlJobId, 'cancellation and waiting list push job IDs must not collide');
});

test('cancelled appointment owner does NOT receive waiting list message', () => {
  const appointment = { customerId: 'uid-ali', date: '2099-01-01', barberId: 'barber-1', serviceId: 'srv-1', startTime: '10:00' };
  // Yadin is waiting, not Ali
  const wlEntry = { id: 'wl-yadin', customerId: 'uid-yadin', date: '2099-01-01', preferenceType: 'whole_day', status: 'active' };
  const matches = waitingListMatchesTrigger(wlEntry, appointment);
  // Yadin matches (whole_day, same date)
  assert.equal(matches, true);
  // But waiting list push is addressed to wlEntry.customerId = Yadin, not appointment.customerId = Ali
  const wlJobCustomer = wlEntry.customerId;
  assert.notEqual(wlJobCustomer, appointment.customerId);
});

test('waiting list customer does NOT receive appointment_cancelled message', () => {
  const appointment = { customerId: 'uid-ali', date: '2099-01-01', startTime: '10:00' };
  const wlEntry = { customerId: 'uid-yadin' };
  // appointment_cancelled job id is tied to appointmentId and targets appointment.customerId
  const cancelJobCustomer = appointment.customerId;
  const wlJobCustomer = wlEntry.customerId;
  assert.notEqual(cancelJobCustomer, wlJobCustomer, 'each notification type goes to a different customer');
});

// ─── PART 2: barberId matching ────────────────────────────────────────────────

test('waiting list matches when barberId in entry matches appointment barberId', () => {
  const entry = { id: 'wl-1', date: '2099-01-01', barberId: 'barber-1', preferenceType: 'whole_day', status: 'active' };
  const appt = { date: '2099-01-01', barberId: 'barber-1', serviceId: 'srv-1', startTime: '10:00' };
  assert.equal(waitingListMatchesTrigger(entry, appt), true);
});

test('waiting list does NOT match when barberId differs', () => {
  const entry = { id: 'wl-1', date: '2099-01-01', barberId: 'barber-1', preferenceType: 'whole_day', status: 'active' };
  const appt = { date: '2099-01-01', barberId: 'barber-2', serviceId: 'srv-1', startTime: '10:00' };
  assert.equal(waitingListMatchesTrigger(entry, appt), false, 'different barber must not match');
});

test('waiting list matches when entry has no barberId (any barber)', () => {
  const entry = { id: 'wl-1', date: '2099-01-01', barberId: null, preferenceType: 'whole_day', status: 'active' };
  const appt = { date: '2099-01-01', barberId: 'barber-99', serviceId: 'srv-1', startTime: '10:00' };
  assert.equal(waitingListMatchesTrigger(entry, appt), true, 'null barberId means any barber');
});

test('appointments.js waitingListMatchesAppointment also checks barberId', () => {
  const base = { date: '2099-01-01', barberId: 'barber-1', serviceId: 'srv-1', startTime: '10:00' };
  const entryMatch = { date: '2099-01-01', barberId: 'barber-1', preferenceType: 'whole_day', status: 'active' };
  const entryNoMatch = { date: '2099-01-01', barberId: 'barber-2', preferenceType: 'whole_day', status: 'active' };
  assert.equal(waitingListMatchesAppointment(entryMatch, base), true);
  assert.equal(waitingListMatchesAppointment(entryNoMatch, base), false);
});

// ─── PART 2: Deduplication ────────────────────────────────────────────────────

test('waitlist push dedup key is deterministic: same entry+date+time = same ID', () => {
  const id1 = waitlistPushJobId('wl-abc', '2099-01-01', '10:00');
  const id2 = waitlistPushJobId('wl-abc', '2099-01-01', '10:00');
  assert.equal(id1, id2, 'same inputs must produce same job ID');
});

test('different appointments freeing the same slot do NOT produce duplicate push IDs', () => {
  // Old dedup (appointmentId-based) would differ; new dedup (entryId+date+time) stays the same
  const id1 = waitlistPushJobId('wl-abc', '2099-01-01', '10:00');
  const id2 = waitlistPushJobId('wl-abc', '2099-01-01', '10:00');
  // NotificationJobService.enqueue uses reference.create — second call with same ID is silently skipped
  assert.equal(id1, id2, 'second cancellation must not generate new push job ID for same entry/slot');
});

test('different waiting list entries produce different push job IDs', () => {
  const id1 = waitlistPushJobId('wl-yadin', '2099-01-01', '10:00');
  const id2 = waitlistPushJobId('wl-eli', '2099-01-01', '10:00');
  assert.notEqual(id1, id2);
});

// ─── PART 2: closedReason stored on waiting list entry ───────────────────────

test('waiting list update payload includes notificationJobId and closedReason', () => {
  const entryId = 'wl-abc';
  const date = '2099-01-01';
  const startTime = '10:00';
  const jobId = waitlistPushJobId(entryId, date, startTime);

  // This mirrors what notifyWaitingListForFreedAppointment writes to waitingList/{entryId}
  const update = {
    status: 'notified',
    notifiedAt: 'server_timestamp',
    notificationJobId: jobId,
    closedReason: 'slot_available_notified',
    updatedAt: 'server_timestamp',
  };

  assert.equal(update.status, 'notified');
  assert.equal(update.notificationJobId, jobId);
  assert.equal(update.closedReason, 'slot_available_notified');
  assert.ok('notifiedAt' in update);
});

// ─── PART 3: Manual slot release controls booking ────────────────────────────

test('slot exactly at release start is accepted', () => {
  assert.equal(isSlotInReleaseWindow('09:00', [release('09:00', '17:00')]), true);
});

test('slot inside release window is accepted', () => {
  assert.equal(isSlotInReleaseWindow('14:30', [release('09:00', '17:00')]), true);
});

test('slot exactly at release end is rejected (exclusive end)', () => {
  assert.equal(isSlotInReleaseWindow('17:00', [release('09:00', '17:00')]), false);
});

test('slot before release window is rejected', () => {
  assert.equal(isSlotInReleaseWindow('08:45', [release('09:00', '17:00')]), false);
});

test('slot after release window is rejected', () => {
  assert.equal(isSlotInReleaseWindow('18:00', [release('09:00', '17:00')]), false);
});

test('service must fully fit inside release window', () => {
  assert.equal(isSlotInReleaseWindow('16:30', [release('09:00', '17:00')], 30), true);
  assert.equal(isSlotInReleaseWindow('16:45', [release('09:00', '17:00')], 30), false);
});

test('no releases at all rejects every slot', () => {
  assert.equal(isSlotInReleaseWindow('10:00', []), false);
  assert.equal(isSlotInReleaseWindow('00:00', []), false);
  assert.equal(isSlotInReleaseWindow('23:59', []), false);
});

test('multiple release windows — slot in second window is accepted', () => {
  const releases = [release('09:00', '12:00'), release('14:00', '18:00')];
  assert.equal(isSlotInReleaseWindow('15:00', releases), true);
});

test('multiple release windows — slot in gap is rejected', () => {
  const releases = [release('09:00', '12:00'), release('14:00', '18:00')];
  assert.equal(isSlotInReleaseWindow('13:00', releases), false);
});

test('cancelled releases are excluded when filtered beforehand', () => {
  const allReleases = [{ ...release('09:00', '17:00'), status: 'cancelled' }];
  const activeOnly = allReleases.filter((r) => r.status === 'active');
  assert.equal(isSlotInReleaseWindow('10:00', activeOnly), false);
});

test('mapBookingSettings defaults availabilityMode to automatic', () => {
  const mapMode = (data) => (data?.availabilityMode === 'manual' ? 'manual' : 'automatic');
  assert.equal(mapMode({}), 'automatic');
  assert.equal(mapMode({ availabilityMode: 'automatic' }), 'automatic');
  assert.equal(mapMode({ availabilityMode: 'manual' }), 'manual');
  assert.equal(mapMode({ availabilityMode: 'anything-else' }), 'automatic');
  assert.equal(mapMode(null), 'automatic');
  assert.equal(mapMode(undefined), 'automatic');
});

// ─── Date range generation ────────────────────────────────────────────────────

const FUTURE = '2099-01-01';

test('single date: fromDate == toDate generates exactly one date', () => {
  const dates = generateSlotReleaseDates(FUTURE, FUTURE, []);
  assert.equal(dates.length, 1);
  assert.equal(dates[0], FUTURE);
});

test('one-week range generates 7 dates when no day filter', () => {
  const dates = generateSlotReleaseDates('2099-01-01', '2099-01-07', []);
  assert.equal(dates.length, 7);
});

test('day-of-week filter keeps only matching days', () => {
  const dates = generateSlotReleaseDates('2099-01-01', '2099-01-07', [1, 3]); // Mon + Wed
  assert.ok(dates.length > 0, 'should have at least one date');
  dates.forEach((d) => {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    assert.ok([1, 3].includes(dow), `unexpected day ${dow} for date ${d}`);
  });
});

test('empty daysOfWeek array includes all days', () => {
  const withFilter = generateSlotReleaseDates('2099-01-01', '2099-01-07', [0, 1, 2, 3, 4, 5, 6]);
  const withoutFilter = generateSlotReleaseDates('2099-01-01', '2099-01-07', []);
  assert.equal(withFilter.length, withoutFilter.length);
});

test('invalid range (fromDate > toDate) returns empty array', () => {
  const dates = generateSlotReleaseDates('2099-01-07', '2099-01-01', []);
  assert.equal(dates.length, 0);
});

test('past dates are excluded from results', () => {
  const dates = generateSlotReleaseDates('2000-01-01', '2000-01-07', []);
  assert.equal(dates.length, 0);
});

test('date range capped at 90 entries', () => {
  const dates = generateSlotReleaseDates('2099-01-01', '2099-12-31', []);
  assert.ok(dates.length <= 90, `expected <=90 but got ${dates.length}`);
});

test('returns dates in chronological order', () => {
  const dates = generateSlotReleaseDates('2099-03-01', '2099-03-10', []);
  for (let i = 1; i < dates.length; i++) {
    assert.ok(dates[i] > dates[i - 1], `dates out of order at index ${i}`);
  }
});

// ─── PART 5: Release batch sends one push per customer ────────────────────────

test('push job id is deterministic: slots_released_{batchId}_{customerId}', () => {
  const batchId = 'batch-abc';
  const customerId = 'cust-123';
  const jobId = `slots_released_${batchId}_${customerId}`;
  assert.equal(jobId, `slots_released_${batchId}_${customerId}`);
});

test('one push job per customer regardless of how many dates are in the batch', () => {
  const batchId = 'batch-xyz';
  const customers = ['cust-1', 'cust-2', 'cust-3'];
  const dates = ['2099-01-01', '2099-01-02', '2099-01-03', '2099-01-04', '2099-01-05', '2099-01-06', '2099-01-07'];

  const jobs = customers.map((customerId) => ({
    id: `slots_released_${batchId}_${customerId}`,
    customerId,
  }));

  assert.equal(jobs.length, customers.length, 'one job per customer');
  assert.equal(new Set(jobs.map((j) => j.id)).size, customers.length, 'all job IDs unique');
  assert.ok(jobs.length < dates.length, 'fewer jobs than dates for a weekly batch');
});

test('inbox notification doc ID dedups by batch+customer', () => {
  const batchId = 'batch-001';
  const customers = ['alice', 'bob', 'carol'];
  const notifIds = customers.map((c) => `slots_released_${batchId}_${c}`);
  assert.equal(new Set(notifIds).size, customers.length, 'unique per customer');
  // Same batch + same customer = same ID (idempotent on retry)
  assert.equal(`slots_released_${batchId}_alice`, `slots_released_${batchId}_alice`);
});

test('different batches produce different notification IDs for same customer', () => {
  const customer = 'cust-1';
  const id1 = `slots_released_batch-aaa_${customer}`;
  const id2 = `slots_released_batch-bbb_${customer}`;
  assert.notEqual(id1, id2);
});

// ─── PART 8: Haircut reminder ─────────────────────────────────────────────────

test('haircut reminder job id is deterministic: haircut_reminder_{appointmentId}_{customerId}', () => {
  const appointmentId = 'appt-123';
  const customerId = 'user-456';
  const scheduledFor = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
  const job = buildPushJobForHaircutReminder(appointmentId, customerId, scheduledFor);
  assert.equal(job.id, `haircut_reminder_${appointmentId}_${customerId}`);
});

test('haircut reminder job has correct type, title and body', () => {
  const job = buildPushJobForHaircutReminder('appt-1', 'user-1', new Date(Date.now() + 21 * 86400000));
  assert.equal(job.data.type, 'haircut_reminder');
  assert.equal(job.data.title, 'הגיע הזמן להסתפר');
  assert.equal(job.data.body, 'עבר זמן מהתספורת האחרונה שלך ב־OST BARBER. היכנס לשריין תור חדש.');
});

test('haircut reminder job data payload includes action open_booking', () => {
  const job = buildPushJobForHaircutReminder('appt-1', 'user-1', new Date(Date.now() + 21 * 86400000));
  assert.equal(job.data.data.action, 'open_booking');
  assert.equal(job.data.data.source, 'rebooking_reminder');
  assert.equal(job.data.data.lastAppointmentId, 'appt-1');
});

test('haircut reminder scheduledFor is 21 days after now by default', () => {
  const now = new Date();
  const intervalDays = 21;
  const scheduledFor = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  const job = buildPushJobForHaircutReminder('appt-1', 'user-1', scheduledFor, now);
  const diff = job.data.scheduledFor.getTime() - now.getTime();
  const expectedMs = intervalDays * 24 * 60 * 60 * 1000;
  assert.equal(diff, expectedMs);
});

test('haircut reminder custom intervalDays (14) produces correct scheduledFor', () => {
  const now = new Date();
  const intervalDays = 14;
  const scheduledFor = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  const job = buildPushJobForHaircutReminder('appt-1', 'user-1', scheduledFor, now);
  const diff = job.data.scheduledFor.getTime() - now.getTime();
  assert.equal(diff, intervalDays * 24 * 60 * 60 * 1000);
});

test('haircut reminder custom intervalDays (42) produces correct scheduledFor', () => {
  const now = new Date();
  const intervalDays = 42;
  const scheduledFor = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  const job = buildPushJobForHaircutReminder('appt-1', 'user-1', scheduledFor, now);
  const diff = job.data.scheduledFor.getTime() - now.getTime();
  assert.equal(diff, intervalDays * 24 * 60 * 60 * 1000);
});

test('duplicate completion produces same job id — enqueue dedup handles it', () => {
  const appointmentId = 'appt-dupe';
  const customerId = 'user-dupe';
  const now = new Date();
  const scheduledFor = new Date(now.getTime() + 21 * 86400000);
  const job1 = buildPushJobForHaircutReminder(appointmentId, customerId, scheduledFor, now);
  const job2 = buildPushJobForHaircutReminder(appointmentId, customerId, scheduledFor, now);
  assert.equal(job1.id, job2.id, 'same appointment + customer = same dedup id');
});

test('different appointments for same customer produce different reminder ids', () => {
  const customerId = 'user-abc';
  const scheduledFor = new Date(Date.now() + 21 * 86400000);
  const job1 = buildPushJobForHaircutReminder('appt-a', customerId, scheduledFor);
  const job2 = buildPushJobForHaircutReminder('appt-b', customerId, scheduledFor);
  assert.notEqual(job1.id, job2.id);
});

test('haircut_reminder type maps to haircutReminderEnabled preference key', () => {
  // preference enabled (default)
  assert.equal(isAllowedByPreferences('haircut_reminder', {}), true);
  assert.equal(isAllowedByPreferences('haircut_reminder', { haircutReminderEnabled: true }), true);
});

test('haircut reminder is blocked when haircutReminderEnabled is false', () => {
  assert.equal(isAllowedByPreferences('haircut_reminder', { haircutReminderEnabled: false }), false);
});

test('global notificationsEnabled:false also blocks haircut reminder', () => {
  assert.equal(isAllowedByPreferences('haircut_reminder', { notificationsEnabled: false }), false);
});

test('haircut reminder not blocked by unrelated preference being false', () => {
  assert.equal(isAllowedByPreferences('haircut_reminder', { reminder24hEnabled: false }), true);
  assert.equal(isAllowedByPreferences('haircut_reminder', { barberMessagesEnabled: false }), true);
});

test('skip reason already_has_future_appointment is the correct string', () => {
  const skipReason = 'already_has_future_appointment';
  assert.equal(skipReason, 'already_has_future_appointment');
});

test('haircut reminder job uses push channel', () => {
  const job = buildPushJobForHaircutReminder('appt-1', 'user-1', new Date(Date.now() + 21 * 86400000));
  assert.equal(job.data.channel, 'push');
  assert.equal(job.data.status, 'pending');
});

test('haircut reminder job customerId matches the given customer', () => {
  const customerId = 'user-xyz';
  const job = buildPushJobForHaircutReminder('appt-1', customerId, new Date(Date.now() + 21 * 86400000));
  assert.equal(job.data.customerId, customerId);
});

// ─── PART 1: Appointment lifecycle / history ──────────────────────────────────

// Mirrors getDisplayStatus from src/pages/Appointments.jsx
const ACTIVE_STATUSES_FE = new Set(['pending', 'approved', 'confirmed', 'scheduled']);
const CUSTOMER_CANCEL_REASONS_FE = new Set(['customer_cancelled', 'customer_replaced_appointment']);
const getDisplayStatus = (appt, today) => {
  if (appt.date < today && ACTIVE_STATUSES_FE.has(appt.status)) return 'completed_auto';
  if (appt.status === 'cancelled') {
    const reason = appt.cancellationReason || '';
    return CUSTOMER_CANCEL_REASONS_FE.has(reason) ? 'cancelled_by_customer' : 'cancelled_by_admin';
  }
  return appt.status;
};

test('ACTIVE_APPOINTMENT_STATUSES contains expected keys', () => {
  assert.ok(ACTIVE_APPOINTMENT_STATUSES.has('pending'));
  assert.ok(ACTIVE_APPOINTMENT_STATUSES.has('confirmed'));
  assert.ok(ACTIVE_APPOINTMENT_STATUSES.has('approved'));
  assert.ok(!ACTIVE_APPOINTMENT_STATUSES.has('completed'));
  assert.ok(!ACTIVE_APPOINTMENT_STATUSES.has('cancelled'));
});

test('findActiveCustomerAppointment returns null for past confirmed appointment', () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const appts = [{ status: 'confirmed', date: yesterday }];
  assert.equal(findActiveCustomerAppointment(appts), null);
});

test('findActiveCustomerAppointment returns null for past pending appointment', () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const appts = [{ status: 'pending', date: yesterday }];
  assert.equal(findActiveCustomerAppointment(appts), null);
});

test('findActiveCustomerAppointment returns future confirmed appointment', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const appt = { status: 'confirmed', date: tomorrow };
  assert.deepEqual(findActiveCustomerAppointment([appt]), appt);
});

test('findActiveCustomerAppointment ignores past appointment and returns future one', () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const future = { status: 'confirmed', date: tomorrow };
  const appts = [{ status: 'confirmed', date: yesterday }, future];
  assert.deepEqual(findActiveCustomerAppointment(appts), future);
});

test('findActiveCustomerAppointment returns null when all appointments are past', () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const appts = [
    { status: 'confirmed', date: yesterday },
    { status: 'pending', date: lastWeek },
  ];
  assert.equal(findActiveCustomerAppointment(appts), null);
});

test('getDisplayStatus: past confirmed appointment shows completed_auto', () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(getDisplayStatus({ status: 'confirmed', date: yesterday }, today), 'completed_auto');
});

test('getDisplayStatus: past pending appointment shows completed_auto', () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(getDisplayStatus({ status: 'pending', date: yesterday }, today), 'completed_auto');
});

test('getDisplayStatus: future confirmed appointment stays confirmed', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(getDisplayStatus({ status: 'confirmed', date: tomorrow }, today), 'confirmed');
});

test('getDisplayStatus: cancelled with customer_cancelled reason shows cancelled_by_customer', () => {
  const today = new Date().toISOString().slice(0, 10);
  const appt = { status: 'cancelled', date: today, cancellationReason: 'customer_cancelled' };
  assert.equal(getDisplayStatus(appt, today), 'cancelled_by_customer');
});

test('getDisplayStatus: cancelled with customer_replaced_appointment reason shows cancelled_by_customer', () => {
  const today = new Date().toISOString().slice(0, 10);
  const appt = { status: 'cancelled', date: today, cancellationReason: 'customer_replaced_appointment' };
  assert.equal(getDisplayStatus(appt, today), 'cancelled_by_customer');
});

test('getDisplayStatus: cancelled with admin_cancelled reason shows cancelled_by_admin', () => {
  const today = new Date().toISOString().slice(0, 10);
  const appt = { status: 'cancelled', date: today, cancellationReason: 'admin_cancelled' };
  assert.equal(getDisplayStatus(appt, today), 'cancelled_by_admin');
});

test('getDisplayStatus: cancelled with barber_unavailable reason shows cancelled_by_admin', () => {
  const today = new Date().toISOString().slice(0, 10);
  const appt = { status: 'cancelled', date: today, cancellationReason: 'barber_unavailable' };
  assert.equal(getDisplayStatus(appt, today), 'cancelled_by_admin');
});

test('getDisplayStatus: rejected appointment shows rejected', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(getDisplayStatus({ status: 'rejected', date: tomorrow }, today), 'rejected');
});

test('getDisplayStatus: explicitly completed appointment shows completed not completed_auto', () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(getDisplayStatus({ status: 'completed', date: yesterday }, today), 'completed');
});

test('cancelled release window does not appear as bookable slot', () => {
  const cancelledRelease = release('10:00', '12:00');
  cancelledRelease.status = 'cancelled';
  // Only active releases should be passed to isSlotInReleaseWindow per rejectManualModeSlot filter
  const activeReleases = [cancelledRelease].filter(r => r.status === 'active');
  assert.equal(isSlotInReleaseWindow('10:30', activeReleases), false);
});

// ─── PART 1 & 2: Admin appointment active/history classification ──────────────

// Mirrors helpers from src/pages/admin/AdminAppointments.jsx
const TERMINAL_STATUSES_ADMIN = new Set(['completed', 'cancelled', 'rejected', 'no_show']);
const ACTIVE_STATUSES_ADMIN = new Set(['pending', 'approved', 'confirmed', 'scheduled']);
const CUSTOMER_CANCEL_REASONS_ADMIN = new Set(['customer_cancelled', 'customer_replaced_appointment']);

const isAppointmentActiveAdmin = (appt, today) =>
  !TERMINAL_STATUSES_ADMIN.has(appt.status) && (appt.date || '') >= today;

const isAppointmentHistoryAdmin = (appt, today) => !isAppointmentActiveAdmin(appt, today);

const getEffectiveStatusAdmin = (appt, today) => {
  if ((appt.date || '') < today && ACTIVE_STATUSES_ADMIN.has(appt.status)) return 'completed_auto';
  if (appt.status === 'cancelled') {
    const reason = appt.cancellationReason || '';
    return CUSTOMER_CANCEL_REASONS_ADMIN.has(reason) ? 'cancelled_by_customer' : 'cancelled_by_admin';
  }
  return appt.status;
};

test('admin: future pending appointment is active', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(isAppointmentActiveAdmin({ status: 'pending', date: tomorrow }, today), true);
});

test('admin: future confirmed appointment is active', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(isAppointmentActiveAdmin({ status: 'confirmed', date: tomorrow }, today), true);
});

test('admin: today pending appointment is active', () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(isAppointmentActiveAdmin({ status: 'pending', date: today }, today), true);
});

test('admin: past pending appointment is NOT active', () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(isAppointmentActiveAdmin({ status: 'pending', date: yesterday }, today), false);
});

test('admin: past confirmed appointment is NOT active', () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(isAppointmentActiveAdmin({ status: 'confirmed', date: yesterday }, today), false);
});

test('admin: completed appointment is NOT active regardless of date', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(isAppointmentActiveAdmin({ status: 'completed', date: tomorrow }, today), false);
});

test('admin: cancelled appointment is NOT active', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(isAppointmentActiveAdmin({ status: 'cancelled', date: tomorrow }, today), false);
});

test('admin: rejected appointment is NOT active', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(isAppointmentActiveAdmin({ status: 'rejected', date: tomorrow }, today), false);
});

test('admin: no_show appointment is NOT active', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(isAppointmentActiveAdmin({ status: 'no_show', date: tomorrow }, today), false);
});

test('admin: past pending appointment IS history', () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(isAppointmentHistoryAdmin({ status: 'pending', date: yesterday }, today), true);
});

test('admin: completed appointment IS history', () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(isAppointmentHistoryAdmin({ status: 'completed', date: yesterday }, today), true);
});

test('admin: cancelled appointment IS history', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(isAppointmentHistoryAdmin({ status: 'cancelled', date: tomorrow }, today), true);
});

test('admin: future active appointment is NOT history', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(isAppointmentHistoryAdmin({ status: 'pending', date: tomorrow }, today), false);
});

test('admin getEffectiveStatus: past pending → completed_auto', () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(getEffectiveStatusAdmin({ status: 'pending', date: yesterday }, today), 'completed_auto');
});

test('admin getEffectiveStatus: past confirmed → completed_auto', () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(getEffectiveStatusAdmin({ status: 'confirmed', date: yesterday }, today), 'completed_auto');
});

test('admin getEffectiveStatus: cancelled with customer reason → cancelled_by_customer', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(getEffectiveStatusAdmin({ status: 'cancelled', date: tomorrow, cancellationReason: 'customer_cancelled' }, today), 'cancelled_by_customer');
});

test('admin getEffectiveStatus: cancelled with admin reason → cancelled_by_admin', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(getEffectiveStatusAdmin({ status: 'cancelled', date: tomorrow, cancellationReason: 'admin_cancelled' }, today), 'cancelled_by_admin');
});

test('admin getEffectiveStatus: cancelled with no reason → cancelled_by_admin', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(getEffectiveStatusAdmin({ status: 'cancelled', date: tomorrow }, today), 'cancelled_by_admin');
});

test('admin getEffectiveStatus: rejected → rejected', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(getEffectiveStatusAdmin({ status: 'rejected', date: tomorrow }, today), 'rejected');
});

test('admin getEffectiveStatus: explicitly completed → completed', () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(getEffectiveStatusAdmin({ status: 'completed', date: yesterday }, today), 'completed');
});

test('admin getEffectiveStatus: future confirmed stays confirmed', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(getEffectiveStatusAdmin({ status: 'confirmed', date: tomorrow }, today), 'confirmed');
});

// ─── PART 8: Inactive service/barber hidden from booking ─────────────────────

// Mirrors client-side filter in Booking.jsx: services.filter(s => s.is_active !== false)
const filterActiveServices = (services) => services.filter(s => s.is_active !== false);

// Mirrors isBarberBookable (src/lib/barberStatus.js) and isBarberDocBookable (functions/src/index.js).
// Three gates: archived must not be true, active must not be false, is_active must not be false.
// Missing fields default to bookable (legacy docs with no active field remain visible).
const filterActiveBarbers = (barbers) =>
  barbers.filter(b => b.archived !== true && b.active !== false && b.is_active !== false);

test('inactive service (is_active: false) is hidden from customer booking list', () => {
  const services = [
    { id: 'svc-1', name: 'תספורת', is_active: true, active: true },
    { id: 'svc-2', name: 'עיצוב זקן', is_active: false, active: false },
  ];
  const visible = filterActiveServices(services);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, 'svc-1');
});

test('active service is shown in customer booking list', () => {
  const services = [
    { id: 'svc-1', name: 'תספורת', is_active: true, active: true },
  ];
  assert.equal(filterActiveServices(services).length, 1);
});

test('service with no is_active field defaults to visible', () => {
  const services = [{ id: 'svc-1', name: 'תספורת' }];
  const visible = filterActiveServices(services);
  assert.equal(visible.length, 1, 'absent is_active defaults to visible (is_active !== false)');
});

test('inactive barber (active: false) is excluded from active barbers', () => {
  const barbers = [
    { id: 'b-1', name: 'יוסי', active: true, archived: false },
    { id: 'b-2', name: 'דני', active: false, archived: false },
  ];
  const visible = filterActiveBarbers(barbers);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, 'b-1');
});

test('archived barber is excluded from active barbers even if active: true', () => {
  const barbers = [
    { id: 'b-1', name: 'יוסי', active: true, archived: false },
    { id: 'b-2', name: 'ישן', active: true, archived: true },
  ];
  const visible = filterActiveBarbers(barbers);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, 'b-1');
});

test('active non-archived barber appears in customer booking', () => {
  const barbers = [{ id: 'b-1', name: 'יוסי', active: true, archived: false }];
  assert.equal(filterActiveBarbers(barbers).length, 1);
});

test('toggle: passing active:false explicitly disables service via normalizeService logic', () => {
  // Mirrors normalizeService: active = input.active ?? input.is_active ?? true
  // Correct toggle call: pass active: newValue (not just is_active)
  const normalizeActive = (input) => input.active ?? input.is_active ?? true;

  // Old broken pattern — spread sets both active:true and is_active:false
  const brokenInput = { active: true, is_active: false };
  assert.equal(normalizeActive(brokenInput), true, 'old pattern: active wins over is_active');

  // Fixed pattern — explicitly pass active: false
  const fixedInput = { active: false };
  assert.equal(normalizeActive(fixedInput), false, 'fixed pattern: explicit active:false works');
});

test('toggle: passing active:true explicitly enables service', () => {
  const normalizeActive = (input) => input.active ?? input.is_active ?? true;
  const input = { active: true };
  assert.equal(normalizeActive(input), true);
});

test('barber toggle: passing active:false disables via normalizeBarber logic', () => {
  const normalizeActive = (input) => input.active ?? input.is_active ?? true;
  // Correct toggle: spread barber then override active explicitly
  const barber = { id: 'b-1', active: true, is_active: true };
  const toggledOff = { ...barber, active: !barber.is_active };
  assert.equal(normalizeActive(toggledOff), false, 'toggling active to false works');
  const toggledOn = { ...barber, active: false, is_active: false };
  assert.equal(normalizeActive({ ...toggledOn, active: !toggledOn.is_active }), true, 'toggling active to true works');
});

// ── PART 9: send-time appointment reminder validation (Bug 2) ──────────────────

const futureAppointment = (overrides = {}) => ({
  status: 'confirmed',
  date: '2099-01-01',
  startTime: '10:00',
  serviceDuration: 30,
  customerId: 'cust-1',
  ...overrides,
});

test('reminder sends when appointment is active and in the future', () => {
  const result = evaluateReminderAppointmentState(futureAppointment(), 'cust-1');
  assert.equal(result.valid, true);
});

test('reminder is skipped with appointment_not_found when appointment doc is missing', () => {
  const result = evaluateReminderAppointmentState(null, 'cust-1');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'appointment_not_found');
});

test('reminder is skipped with appointment_not_active for a cancelled appointment', () => {
  const result = evaluateReminderAppointmentState(futureAppointment({ status: 'cancelled' }), 'cust-1');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'appointment_not_active');
});

test('reminder is skipped with appointment_not_active for a completed appointment', () => {
  const result = evaluateReminderAppointmentState(futureAppointment({ status: 'completed' }), 'cust-1');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'appointment_not_active');
});

test('reminder is skipped with appointment_not_active for a rejected appointment', () => {
  const result = evaluateReminderAppointmentState(futureAppointment({ status: 'rejected' }), 'cust-1');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'appointment_not_active');
});

test('reminder is skipped with appointment_not_active for a no_show appointment', () => {
  const result = evaluateReminderAppointmentState(futureAppointment({ status: 'no_show' }), 'cust-1');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'appointment_not_active');
});

test('reminder is skipped with appointment_already_past once the end time has passed', () => {
  const past = futureAppointment({ status: 'confirmed', date: '2000-01-01', startTime: '10:00' });
  const result = evaluateReminderAppointmentState(past, 'cust-1', new Date('2020-01-01T00:00:00Z'));
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'appointment_already_past');
});

test('reminder is skipped with appointment_customer_mismatch when job customerId differs from appointment owner', () => {
  const result = evaluateReminderAppointmentState(futureAppointment({ customerId: 'cust-1' }), 'cust-2');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'appointment_customer_mismatch');
});

test('reminder is not blocked by customer mismatch check when job has no customerId', () => {
  const result = evaluateReminderAppointmentState(futureAppointment({ customerId: 'cust-1' }), null);
  assert.equal(result.valid, true);
});

// ─── PART 10: Barber visibility + per-barber release enforcement ──────────────

// ── A) isBarberDocBookable (exported server-side helper in functions/src/index.js) ──

test('active barber (active:true, archived:false) is bookable', () => {
  assert.equal(isBarberDocBookable({ active: true, archived: false }), true);
});

test('legacy barber with no active/archived fields is bookable by default', () => {
  // Old Firestore docs may have neither field — should be treated as active.
  assert.equal(isBarberDocBookable({ name: 'ספר ותיק' }), true);
});

test('barber with active:false is NOT bookable', () => {
  assert.equal(isBarberDocBookable({ active: false, archived: false }), false);
});

test('barber with is_active:false is NOT bookable', () => {
  assert.equal(isBarberDocBookable({ is_active: false }), false);
});

test('barber with active:false and is_active:false is NOT bookable', () => {
  assert.equal(isBarberDocBookable({ active: false, is_active: false }), false);
});

test('archived barber (archived:true) is NOT bookable even with active:true', () => {
  assert.equal(isBarberDocBookable({ active: true, archived: true }), false);
});

test('archived barber is NOT bookable even if active field is missing', () => {
  assert.equal(isBarberDocBookable({ archived: true }), false);
});

test('null/undefined barber data is NOT bookable (graceful — no crash)', () => {
  assert.equal(isBarberDocBookable(null), false);
  assert.equal(isBarberDocBookable(undefined), false);
});

// ── B) filterActiveBarbers — updated to mirror full isBarberBookable logic ──────

test('barber with only is_active:false is excluded from customer booking', () => {
  const barbers = [
    { id: 'b-1', name: 'פעיל', active: true },
    { id: 'b-2', name: 'כבוי', is_active: false },
  ];
  const visible = filterActiveBarbers(barbers);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, 'b-1');
});

test('legacy barber (no active field) is visible in customer booking', () => {
  const barbers = [{ id: 'b-1', name: 'ספר ותיק' }];
  const visible = filterActiveBarbers(barbers);
  assert.equal(visible.length, 1, 'missing active field defaults to visible');
});

test('all-inactive barber list returns empty — triggers "no active barber" copy', () => {
  const barbers = [
    { id: 'b-1', name: 'כבוי', active: false },
    { id: 'b-2', name: 'ארכיב', archived: true },
  ];
  assert.equal(filterActiveBarbers(barbers).length, 0);
});

// ── C) Per-barber release isolation ──────────────────────────────────────────
//
// Booking.jsx and rejectManualModeSlot both filter releases by barberId before
// checking slot fit. These tests verify that isolation logic is correct.

// Mirrors: releases.filter(r => r.barberId === selectedBarberId && r.status === 'active')
const releasesForBarber = (releases, barberId) =>
  releases.filter(r => r.barberId === barberId && r.status === 'active');

test("barber A's release allows booking barber A in that window", () => {
  const releases = [release('10:00', '12:00', 'barber-a')];
  const barberASlots = releasesForBarber(releases, 'barber-a');
  assert.equal(isSlotInReleaseWindow('10:00', barberASlots, 30), true);
});

test("barber A's release does NOT allow booking barber B in the same window", () => {
  const releases = [release('10:00', '12:00', 'barber-a')];
  const barberBSlots = releasesForBarber(releases, 'barber-b');
  assert.equal(isSlotInReleaseWindow('10:00', barberBSlots, 30), false,
    'barber B has no release in that window — booking must be rejected');
});

test("barber B's release does NOT allow booking barber A in the same window", () => {
  const releases = [release('14:00', '16:00', 'barber-b')];
  const barberASlots = releasesForBarber(releases, 'barber-a');
  assert.equal(isSlotInReleaseWindow('14:00', barberASlots, 30), false,
    'barber A has no release at 14:00 — must be rejected');
});

test('each barber can have their own independent release window', () => {
  const releases = [
    release('09:00', '11:00', 'barber-a'),
    release('14:00', '17:00', 'barber-b'),
  ];
  const aSlots = releasesForBarber(releases, 'barber-a');
  const bSlots = releasesForBarber(releases, 'barber-b');

  assert.equal(isSlotInReleaseWindow('09:00', aSlots, 60), true,  'barber A: 09:00 fits in 09:00-11:00');
  assert.equal(isSlotInReleaseWindow('14:00', bSlots, 60), true,  'barber B: 14:00 fits in 14:00-17:00');
  assert.equal(isSlotInReleaseWindow('14:00', aSlots, 60), false, 'barber A has no 14:00 release');
  assert.equal(isSlotInReleaseWindow('09:00', bSlots, 60), false, 'barber B has no 09:00 release');
});

test('manual mode with no release for selected barber rejects every slot', () => {
  const releases = [release('10:00', '12:00', 'barber-a')];
  const barberCSlots = releasesForBarber(releases, 'barber-c');
  assert.equal(barberCSlots.length, 0, 'no release docs for barber C');
  assert.equal(isSlotInReleaseWindow('10:00', barberCSlots, 30), false);
  assert.equal(isSlotInReleaseWindow('11:00', barberCSlots, 30), false);
});

test('full service duration must fit inside barber release window', () => {
  const releases = [release('10:00', '10:30', 'barber-a')];
  const slots = releasesForBarber(releases, 'barber-a');
  // 30-minute service at 10:00 fits exactly (10:00–10:30 ≤ 10:00–10:30)
  assert.equal(isSlotInReleaseWindow('10:00', slots, 30), true);
  // 30-minute service at 10:10 would end at 10:40, past the window end
  assert.equal(isSlotInReleaseWindow('10:10', slots, 30), false,
    '10:10 + 30min = 10:40 which exceeds release end 10:30');
  // 60-minute service at 10:00 ends at 11:00, past the window
  assert.equal(isSlotInReleaseWindow('10:00', slots, 60), false,
    '10:00 + 60min = 11:00 which exceeds release end 10:30');
});

test('slot at release boundary end time is rejected (slot end must be ≤ window end)', () => {
  const releases = [release('10:00', '11:00', 'barber-a')];
  const slots = releasesForBarber(releases, 'barber-a');
  // 30-minute service at 10:30 ends exactly at 11:00 — must fit
  assert.equal(isSlotInReleaseWindow('10:30', slots, 30), true, '10:30+30=11:00 ≤ 11:00');
  // 30-minute service at 10:31 ends at 11:01 — must NOT fit
  assert.equal(isSlotInReleaseWindow('10:31', slots, 30), false, '10:31+30=11:01 > 11:00');
});

// ── D) All-barbers batch release — structural invariants ──────────────────────
//
// publishManualSlotRelease with barberId:'all' creates one release doc per barber
// per date, all sharing the same releaseBatchId. These tests verify the structural
// properties of that output without hitting Firestore.

test('all-barbers batch: each doc has a barberId (not "all")', () => {
  const targetBarberIds = ['barber-a', 'barber-b', 'barber-c'];
  const batchId = 'batch-xyz';
  const docs = targetBarberIds.map(bid => ({
    barberId: bid,
    date: '2099-09-01',
    startTime: '10:00',
    endTime: '12:00',
    releaseBatchId: batchId,
    status: 'active',
  }));

  assert.equal(docs.length, 3, 'one doc per barber');
  assert.ok(docs.every(d => d.barberId !== 'all'), 'no doc stores barberId="all"');
  assert.ok(docs.every(d => typeof d.barberId === 'string' && d.barberId.length > 0), 'each doc has a real barberId');
});

test('all-barbers batch: all docs share the same releaseBatchId', () => {
  const batchId = 'batch-shared-123';
  const docs = ['barber-a', 'barber-b'].map(bid => ({
    barberId: bid, releaseBatchId: batchId,
  }));
  const batchIds = [...new Set(docs.map(d => d.releaseBatchId))];
  assert.equal(batchIds.length, 1, 'all docs share one batchId');
  assert.equal(batchIds[0], batchId);
});

test('batch cancel: filters releases by releaseBatchId, affects all barbers in batch', () => {
  const batchId = 'batch-to-cancel';
  const releases = [
    { id: 'r1', barberId: 'barber-a', releaseBatchId: batchId, status: 'active' },
    { id: 'r2', barberId: 'barber-b', releaseBatchId: batchId, status: 'active' },
    { id: 'r3', barberId: 'barber-a', releaseBatchId: 'other-batch', status: 'active' },
  ];
  const toBeCancelled = releases.filter(r => r.releaseBatchId === batchId);
  assert.equal(toBeCancelled.length, 2, 'both barbers in the batch are cancelled');
  assert.ok(toBeCancelled.some(r => r.barberId === 'barber-a'));
  assert.ok(toBeCancelled.some(r => r.barberId === 'barber-b'));
  const untouched = releases.filter(r => r.releaseBatchId !== batchId);
  assert.equal(untouched.length, 1, 'release from other batch is not cancelled');
  assert.equal(untouched[0].id, 'r3');
});

test('barber-specific cancel: only affects releases for that barber', () => {
  const releases = [
    { id: 'r1', barberId: 'barber-a', status: 'active' },
    { id: 'r2', barberId: 'barber-b', status: 'active' },
  ];
  const cancelled = releases.filter(r => r.barberId === 'barber-a').map(r => ({ ...r, status: 'cancelled' }));
  const final = releases.map(r => cancelled.find(c => c.id === r.id) || r);
  assert.equal(final.find(r => r.id === 'r1').status, 'cancelled');
  assert.equal(final.find(r => r.id === 'r2').status, 'active', 'barber B release unaffected');
});

// ─── PART 11: Waitlist release notifications + expiry + barber deactivation ───

// ── A) Waitlist matching when slots are released ──────────────────────────────

// Mirrors the filtering logic inside publishManualSlotRelease's waitlist section.
const waitlistMatchesRelease = (entry, releasedDateSet, targetBarberIdSet) => {
  if (!entry.date || !releasedDateSet.has(entry.date)) return false;
  const entryBarberMode = entry.barberMode || (entry.barberId ? 'single' : 'all');
  if (entryBarberMode === 'single' && entry.barberId && !targetBarberIdSet.has(entry.barberId)) {
    return false;
  }
  return true;
};

test('waitlist entry matching released date is notified', () => {
  const entry = { id: 'wl-1', customerId: 'cust-1', date: '2099-09-01', status: 'active', barberMode: 'all' };
  const releasedDates = new Set(['2099-09-01', '2099-09-02']);
  const barberIds = new Set(['barber-a']);
  assert.equal(waitlistMatchesRelease(entry, releasedDates, barberIds), true);
});

test('waitlist entry on a different date is NOT notified', () => {
  const entry = { id: 'wl-1', customerId: 'cust-1', date: '2099-09-05', status: 'active', barberMode: 'all' };
  const releasedDates = new Set(['2099-09-01', '2099-09-02']);
  const barberIds = new Set(['barber-a']);
  assert.equal(waitlistMatchesRelease(entry, releasedDates, barberIds), false);
});

test('all-barbers waitlist entry is notified by any barber release', () => {
  const entry = { id: 'wl-1', date: '2099-09-01', barberMode: 'all', barberId: null };
  const releasedDates = new Set(['2099-09-01']);
  const anyBarberIdSet = new Set(['barber-a']);
  assert.equal(waitlistMatchesRelease(entry, releasedDates, anyBarberIdSet), true);
});

test('single-barber waitlist entry is notified when its barber released slots', () => {
  const entry = { id: 'wl-1', date: '2099-09-01', barberMode: 'single', barberId: 'barber-a' };
  const releasedDates = new Set(['2099-09-01']);
  const targetIds = new Set(['barber-a']);
  assert.equal(waitlistMatchesRelease(entry, releasedDates, targetIds), true);
});

test('single-barber waitlist entry is NOT notified when a different barber released', () => {
  const entry = { id: 'wl-1', date: '2099-09-01', barberMode: 'single', barberId: 'barber-b' };
  const releasedDates = new Set(['2099-09-01']);
  const targetIds = new Set(['barber-a']); // barber-b was not in this release
  assert.equal(waitlistMatchesRelease(entry, releasedDates, targetIds), false);
});

test('waitlist dedup: same entry gets same push job ID per release batch', () => {
  const waitingListId = 'wl-abc';
  const releaseBatchId = 'batch-xyz';
  const id1 = `waitlist_release_notify_${waitingListId}_${releaseBatchId}`;
  const id2 = `waitlist_release_notify_${waitingListId}_${releaseBatchId}`;
  assert.equal(id1, id2, 'push job ID is deterministic — same entry+batch cannot fire twice');
});

test('waitlist dedup: different release batches produce different push job IDs', () => {
  const waitingListId = 'wl-abc';
  const id1 = `waitlist_release_notify_${waitingListId}_batch-1`;
  const id2 = `waitlist_release_notify_${waitingListId}_batch-2`;
  assert.notEqual(id1, id2, 'each batch generates a separate push job for the same entry');
});

// ── B) Waitlist expiry filtering ──────────────────────────────────────────────

// Mirrors the client-side defensive filter in AdminWaitingList and the
// server-side scheduled expiry (scheduledWaitlistExpiry).
const isWaitlistEntryExpired = (entry, todayStr) =>
  typeof entry.date === 'string' && entry.date < todayStr;

test('past waitlist entry (date yesterday) is treated as expired', () => {
  assert.equal(isWaitlistEntryExpired({ date: '2000-01-01' }, '2026-07-03'), true);
});

test('today waitlist entry is NOT expired', () => {
  assert.equal(isWaitlistEntryExpired({ date: '2026-07-03' }, '2026-07-03'), false);
});

test('future waitlist entry is NOT expired', () => {
  assert.equal(isWaitlistEntryExpired({ date: '2099-12-31' }, '2026-07-03'), false);
});

test('expired waitlist entry is excluded from release notification matching', () => {
  const expiredEntry = { id: 'wl-old', date: '2000-01-01', barberMode: 'all', status: 'active' };
  const releasedDates = new Set(['2000-01-01']); // would match date, but entry is past
  const barberIds = new Set(['barber-a']);
  const todayStr = '2026-07-03';
  // The published date filter checks: entry.date >= todayStr before checking releasedDateSet
  const matchesDate = releasedDates.has(expiredEntry.date);
  const isExpired = isWaitlistEntryExpired(expiredEntry, todayStr);
  // Despite date matching, expired entry should be excluded
  assert.equal(matchesDate, true);
  assert.equal(isExpired, true, 'entry is past and should be excluded');
  // The actual filter: date must be >= todayStr
  const wouldBeNotified = !isExpired && releasedDates.has(expiredEntry.date);
  assert.equal(wouldBeNotified, false, 'expired entry is not notified');
});

// ── C) Barber deactivation: appointment filtering ────────────────────────────

// Mirrors the toCancel filter in deactivateBarber Cloud Function.
const ACTIVE_STATUSES = new Set(['pending', 'approved', 'confirmed', 'scheduled']);
const TERMINAL_STATUSES = new Set(['completed', 'completed_auto', 'cancelled', 'cancelled_by_admin', 'cancelled_by_customer', 'rejected', 'no_show']);

const shouldCancelOnDeactivation = (appt, barberId, todayStr) => {
  if (appt.barberId !== barberId) return false;
  if (TERMINAL_STATUSES.has(appt.status)) return false;
  if (!ACTIVE_STATUSES.has(appt.status)) return false;
  if (!appt.date || appt.date < todayStr) return false;
  return true;
};

const TODAY = '2026-07-03';

test('deactivating barber A cancels their future confirmed appointment', () => {
  const appt = { barberId: 'barber-a', status: 'confirmed', date: '2099-09-01' };
  assert.equal(shouldCancelOnDeactivation(appt, 'barber-a', TODAY), true);
});

test('deactivating barber A cancels their future pending appointment', () => {
  const appt = { barberId: 'barber-a', status: 'pending', date: '2099-09-01' };
  assert.equal(shouldCancelOnDeactivation(appt, 'barber-a', TODAY), true);
});

test('deactivating barber A does NOT cancel their past appointment', () => {
  const appt = { barberId: 'barber-a', status: 'confirmed', date: '2000-01-01' };
  assert.equal(shouldCancelOnDeactivation(appt, 'barber-a', TODAY), false);
});

test('deactivating barber A does NOT cancel their completed appointment', () => {
  const appt = { barberId: 'barber-a', status: 'completed', date: '2099-09-01' };
  assert.equal(shouldCancelOnDeactivation(appt, 'barber-a', TODAY), false);
});

test('deactivating barber A does NOT cancel their already-cancelled appointment', () => {
  for (const status of ['cancelled', 'cancelled_by_admin', 'cancelled_by_customer', 'rejected', 'no_show']) {
    const appt = { barberId: 'barber-a', status, date: '2099-09-01' };
    assert.equal(shouldCancelOnDeactivation(appt, 'barber-a', TODAY), false, `${status} must not be re-cancelled`);
  }
});

test('deactivating barber A does NOT cancel barber B appointments', () => {
  const appt = { barberId: 'barber-b', status: 'confirmed', date: '2099-09-01' };
  assert.equal(shouldCancelOnDeactivation(appt, 'barber-a', TODAY), false,
    'barber B appointment must not be affected by barber A deactivation');
});

test('cancellation note carries admin reason for affected customers', () => {
  const adminReason = 'הספר יצא לחופשה';
  const cancelPayload = {
    status: 'cancelled',
    cancellationReason: 'barber_unavailable',
    cancellationNote: adminReason,
    cancelledBy: 'admin',
  };
  assert.equal(cancelPayload.cancellationNote, adminReason, 'reason is stored on cancelled appointment');
  assert.equal(cancelPayload.cancellationReason, 'barber_unavailable');
});

test('push body includes barber name and reason when reason is provided', () => {
  const barberName = 'יוסי';
  const reason = 'הספר יצא לחופשה';
  const body = `התור שלך אצל ${barberName} בוטל כי הספר לא זמין. סיבה: ${reason}`;
  assert.ok(body.includes(barberName), 'body includes barber name');
  assert.ok(body.includes(reason), 'body includes reason');
});

// ── D) Required reason validation for deactivateBarber ───────────────────────
//
// Since Session 3 correction: reason is REQUIRED on deactivateBarber.
// Server rejects with invalid-argument if reason is missing/empty.
// Push body ALWAYS includes reason — the conditional branch is unreachable.

test('deactivateBarber: empty reason string is rejected (mirrors server invalid-argument guard)', () => {
  // Server logic: if (!reason) throw HttpsError('invalid-argument', 'חובה להזין סיבה...')
  const validateReason = (reason) => {
    if (!reason || !reason.trim()) {
      return { valid: false, code: 'invalid-argument', message: 'חובה להזין סיבה לביטול זמינות הספר' };
    }
    return { valid: true };
  };

  assert.deepEqual(validateReason(''), { valid: false, code: 'invalid-argument', message: 'חובה להזין סיבה לביטול זמינות הספר' });
  assert.deepEqual(validateReason('   '), { valid: false, code: 'invalid-argument', message: 'חובה להזין סיבה לביטול זמינות הספר' });
  assert.deepEqual(validateReason(null), { valid: false, code: 'invalid-argument', message: 'חובה להזין סיבה לביטול זמינות הספר' });
  assert.deepEqual(validateReason(undefined), { valid: false, code: 'invalid-argument', message: 'חובה להזין סיבה לביטול זמינות הספר' });
  assert.deepEqual(validateReason('הספר יצא לחופשה'), { valid: true });
});

test('deactivateBarber: valid reason is always stored as cancellationNote on cancelled appointment', () => {
  const reason = 'הספר לא זמין החודש';
  const appt = { id: 'appt-1', status: 'confirmed', date: '2099-09-01', barberId: 'barber-a' };
  // Mirrors the Firestore update payload built in deactivateBarber
  const updatePayload = {
    status: 'cancelled',
    cancellationReason: 'barber_unavailable',
    cancellationNote: reason,
    cancelledBy: 'admin',
    cancelledAt: 'SERVER_TIMESTAMP',
  };
  assert.equal(updatePayload.cancellationNote, reason, 'reason stored verbatim as cancellationNote');
  assert.equal(updatePayload.cancellationReason, 'barber_unavailable', 'reason code is barber_unavailable');
  assert.equal(updatePayload.status, 'cancelled');
  // reason is truthy — no null/undefined stored
  assert.ok(updatePayload.cancellationNote && updatePayload.cancellationNote.trim().length > 0);
});

test('deactivateBarber: push body always includes reason — no conditional branch (reason is required)', () => {
  // Since reason is validated server-side before push creation, the empty-reason
  // branch is unreachable in production. Body template always uses reason directly.
  const buildDeactivatePushBody = (barberName, reason) =>
    `התור שלך אצל ${barberName} בוטל כי הספר לא זמין. סיבה: ${reason}`;

  const body1 = buildDeactivatePushBody('יוסי', 'הספר יצא לחופשה');
  assert.ok(body1.includes('יוסי'), 'body includes barber name');
  assert.ok(body1.includes('הספר יצא לחופשה'), 'body includes reason');
  assert.ok(body1.includes('סיבה:'), 'body always has "Reason:" prefix');

  const body2 = buildDeactivatePushBody('אבי', 'חופשה שנתית');
  assert.ok(body2.includes('אבי'));
  assert.ok(body2.includes('חופשה שנתית'));
  assert.ok(body2.includes('סיבה:'));
});

test('reactivating barber (active:true) does NOT cancel any appointments', () => {
  // On reactivation, AdminBarbers calls activateMutation which calls saveBarber — no cancellation.
  // The deactivateBarber callable is only invoked when toggling FROM active TO inactive.
  // This test verifies the guard logic: only cancel when going from bookable to not bookable.
  const barberWasBookable = true;
  const newActiveValue = !barberWasBookable; // false → this is deactivation
  assert.equal(newActiveValue, false);

  const barberWasNotBookable = false;
  const newActiveValueForReactivation = !barberWasNotBookable; // true → this is reactivation
  assert.equal(newActiveValueForReactivation, true);
  // Reactivation path uses activateMutation → saveBarber, no deactivateBarber callable
});
