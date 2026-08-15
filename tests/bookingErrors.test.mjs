import assert from 'node:assert/strict';
import test from 'node:test';
import { getBookingRejectionMessage } from '../src/lib/bookingErrors.js';

test('blocked customer message includes the exact admin reason', () => {
  assert.equal(getBookingRejectionMessage({
    details: { code: 'customer/blocked', blockedReason: 'אי הגעה חוזרת' },
  }), 'החשבון שלך חסום לקביעת תורים. סיבה: אי הגעה חוזרת. פנה לעסק.');
});

test('booking policy errors have clear Hebrew messages', () => {
  assert.equal(getBookingRejectionMessage({
    details: { code: 'appointment/active-limit' },
  }), 'כבר יש לך תור פעיל. ניתן לבטל את התור הקיים ולקבוע תור חדש.');
  assert.equal(getBookingRejectionMessage({
    details: { code: 'appointment/conflict' },
  }), 'השעה שבחרת כבר נתפסה. בחר שעה אחרת.');
  assert.equal(getBookingRejectionMessage({
    details: { code: 'business/closed-day' },
  }), 'העסק סגור ביום הזה.');
  assert.equal(getBookingRejectionMessage({
    details: { code: 'customer/payment-required' },
  }), 'לא ניתן להזמין תור עד להסדרת דרישת התשלום מול הספר.');
  assert.equal(getBookingRejectionMessage({
    details: { code: 'manual_release_window_not_found' },
  }), 'לא נפתחו תורים לספר הזה בשעה שבחרת');
  assert.equal(getBookingRejectionMessage({
    details: { code: 'waiting-list/date-unavailable' },
  }), 'לא ניתן להצטרף לרשימת המתנה בתאריך סגור או חסום.');
});
