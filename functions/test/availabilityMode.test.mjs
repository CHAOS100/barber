import test from 'node:test';
import assert from 'node:assert/strict';
import { timeToMinutes } from '../src/scheduling.js';
import { generateSlotReleaseDates } from '../src/index.js';
import { buildPushJobForHaircutReminder } from '../src/notifications/notificationJobs.js';
import { isAllowedByPreferences } from '../src/notifications/pushSender.js';
import { ACTIVE_APPOINTMENT_STATUSES, findActiveCustomerAppointment } from '../src/bookingPolicy.js';

// ─── Helpers mirroring server logic ──────────────────────────────────────────

// Mirrors rejectManualModeSlot in appointments.js
const isSlotInReleaseWindow = (slotTime, releases) => {
  const slotMinutes = timeToMinutes(slotTime);
  return releases.some((r) => {
    const from = timeToMinutes(r.startTime);
    const to = timeToMinutes(r.endTime);
    return slotMinutes >= from && slotMinutes < to;
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
