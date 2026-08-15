import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMonthlyStats,
  buildPeakHours,
  calculateAdminStats,
  revenueFor,
} from '../src/lib/dashboardStats.js';

const now = new Date('2030-06-20T09:00:00.000Z');

test('dashboard ignores soft-deleted records and cancelled rows in appointment KPIs', () => {
  const appointments = [
    { date: '2030-06-20', status: 'confirmed', paid: true, servicePrice: 80, startTime: '10:00' },
    { date: '2030-06-20', status: 'cancelled', paid: false, servicePrice: 80, startTime: '11:00' },
    { date: '2030-06-20', status: 'completed', paid: true, servicePrice: 120, deletedFromAdmin: true, startTime: '12:00' },
  ];
  const stats = calculateAdminStats(appointments, [], [], [], now);
  assert.equal(stats.todayAppointments, 1);
  assert.equal(stats.todayRevenue, 80);
  assert.equal(stats.cancelledAppointments, 1);
});

test('revenue uses paid Firestore values and never counts removed records', () => {
  assert.equal(revenueFor({ paid: true, servicePrice: 75 }), 75);
  assert.equal(revenueFor({ paid: false, servicePrice: 75 }), 0);
  assert.equal(revenueFor({ paid: true, servicePrice: 75, deletedFromAdmin: true }), 0);
});

test('monthly cancellation rate inputs retain total bookings separately from fulfilled count', () => {
  const [month] = buildMonthlyStats([
    { date: '2030-06-10', status: 'completed', customerId: 'a' },
    { date: '2030-06-11', status: 'cancelled', customerId: 'b' },
  ], now, 1);
  assert.equal(month.appointments, 1);
  assert.equal(month.totalBookings, 2);
  assert.equal(month.cancellations, 1);
});

test('peak hours exclude cancelled and soft-deleted appointments', () => {
  assert.deepEqual(buildPeakHours([
    { startTime: '10:00', status: 'confirmed' },
    { startTime: '10:30', status: 'cancelled' },
    { startTime: '11:00', status: 'completed', deletedFromAdmin: true },
  ]), [{ hour: '10', count: 1 }]);
});
