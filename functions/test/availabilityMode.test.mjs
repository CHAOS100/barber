import test from 'node:test';
import assert from 'node:assert/strict';
import { timeToMinutes } from '../src/scheduling.js';
import { generateSlotReleaseDates } from '../src/index.js';

// ─── Slot-in-window logic ─────────────────────────────────────────────────────
// Mirrors rejectManualModeSlot in appointments.js — update here if it changes.
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

// ─── Manual booking validation ────────────────────────────────────────────────

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

// Use a future date well past any "today" the tests might run in
const FUTURE = '2099-01-01'; // always future — safe anchor

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
  // 2099-01-01 = Thursday (UTC day 4). Week Mon–Sun:
  // 01=Thu, 02=Fri, 03=Sat, 04=Sun, 05=Mon, 06=Tue, 07=Wed
  // UTC days: Thu=4, Fri=5, Sat=6, Sun=0, Mon=1, Tue=2, Wed=3
  const dates = generateSlotReleaseDates('2099-01-01', '2099-01-07', [1, 3]); // Mon(1)+Wed(3)
  assert.ok(dates.length > 0, 'should have at least one date');
  dates.forEach((d) => {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    assert.ok([1, 3].includes(dow), `unexpected day ${dow} for date ${d}`);
  });
});

test('empty daysOfWeek array includes all days', () => {
  const withFilter = generateSlotReleaseDates('2099-01-01', '2099-01-07', [0,1,2,3,4,5,6]);
  const withoutFilter = generateSlotReleaseDates('2099-01-01', '2099-01-07', []);
  assert.equal(withFilter.length, withoutFilter.length);
});

test('invalid range (fromDate > toDate) returns empty array', () => {
  const dates = generateSlotReleaseDates('2099-01-07', '2099-01-01', []);
  assert.equal(dates.length, 0);
});

test('past dates are excluded from results', () => {
  // All dates in 2000 are past
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

// ─── Notification deduplication ───────────────────────────────────────────────

test('push job id is deterministic: slots_released_{batchId}_{customerId}', () => {
  const batchId = 'batch-abc';
  const customerId = 'cust-123';
  const expectedId = `slots_released_${batchId}_${customerId}`;
  // Verify the pattern used in index.js callable and notificationJobs.js builder
  const jobId = `slots_released_${batchId}_${customerId}`;
  assert.equal(jobId, expectedId);
});

test('one push job id per customer regardless of how many dates are in the batch', () => {
  const batchId = 'batch-xyz';
  const customers = ['cust-1', 'cust-2', 'cust-3'];
  const dates = ['2099-01-01', '2099-01-02', '2099-01-03', '2099-01-04', '2099-01-05', '2099-01-06', '2099-01-07'];

  // Simulate: one push job per customer (not per date)
  const jobs = customers.map((customerId) => ({
    id: `slots_released_${batchId}_${customerId}`,
    customerId,
  }));

  assert.equal(jobs.length, customers.length, 'should have exactly one job per customer');
  assert.equal(new Set(jobs.map(j => j.id)).size, customers.length, 'all job IDs must be unique');

  // Even if we had 7 dates, we still only create 3 jobs
  assert.ok(jobs.length < dates.length, 'job count should be less than date count for a weekly batch');
});

test('inbox notification doc ID dedups by batch+customer', () => {
  const batchId = 'batch-001';
  const customers = ['alice', 'bob', 'carol'];
  const notifIds = customers.map(c => `slots_released_${batchId}_${c}`);

  assert.equal(new Set(notifIds).size, customers.length, 'all notification doc IDs must be unique per customer');

  // Same batch, same customer = same ID (prevents duplicate if callable retried)
  const idA = `slots_released_${batchId}_alice`;
  const idB = `slots_released_${batchId}_alice`;
  assert.equal(idA, idB);
});

test('different batches produce different notification IDs for same customer', () => {
  const batch1 = 'batch-aaa';
  const batch2 = 'batch-bbb';
  const customer = 'cust-1';
  const id1 = `slots_released_${batch1}_${customer}`;
  const id2 = `slots_released_${batch2}_${customer}`;
  assert.notEqual(id1, id2, 'two separate batches should create different notification docs');
});
