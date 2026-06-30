import assert from 'node:assert/strict';
import test from 'node:test';
import { isBarberBookable } from '../src/lib/barberStatus.js';

test('active:true and archived:false barber is bookable', () => {
  assert.equal(isBarberBookable({ active: true, archived: false }), true);
});

test('missing active defaults to bookable when not archived', () => {
  assert.equal(isBarberBookable({ archived: false }), true);
  assert.equal(isBarberBookable({}), true);
});

test('active:false barber is not bookable', () => {
  assert.equal(isBarberBookable({ active: false, archived: false }), false);
});

test('legacy is_active:false barber is not bookable', () => {
  assert.equal(isBarberBookable({ is_active: false, archived: false }), false);
});

test('archived:true barber is not bookable', () => {
  assert.equal(isBarberBookable({ active: true, archived: true }), false);
});
