const TEMPORARY_ERROR_CODES = new Set([
  'functions/internal',
  'functions/unavailable',
  'functions/unknown',
  'firestore/unavailable',
  'auth/network-request-failed',
]);

export const getBookingRejectionCode = (error) =>
  error?.details?.code || error?.code || 'unknown';

export const getBookingRejectionMessage = (error) => {
  const code = getBookingRejectionCode(error);
  const blockedReason = String(error?.details?.blockedReason || '').trim();

  if (code === 'customer/blocked') {
    return blockedReason
      ? `החשבון שלך חסום לקביעת תורים. סיבה: ${blockedReason}. פנה לעסק.`
      : 'החשבון שלך חסום לקביעת תורים. פנה לעסק.';
  }
  if (code === 'appointment/active-limit') {
    return 'כבר יש לך תור פעיל. ניתן לבטל את התור הקיים ולקבוע תור חדש.';
  }
  if (code === 'appointment/conflict' || code === 'functions/already-exists') {
    return 'השעה שבחרת כבר נתפסה. בחר שעה אחרת.';
  }
  if (code === 'business/closed-day') return 'העסק סגור ביום הזה.';
  if (code === 'appointment/outside-working-hours') return 'השעה שבחרת מחוץ לשעות הפעילות.';
  if (code === 'appointment/duration-does-not-fit') {
    return 'משך השירות לא נכנס בחלון הזמן הפנוי.';
  }
  if (code === 'customer/profile-missing') {
    return 'חסרים פרטי לקוח. יש להשלים הרשמה לפני קביעת תור.';
  }
  if (code === 'appointment/not-replaceable' || code === 'appointment/active-not-found') {
    return 'התור הקיים כבר אינו פעיל ולא ניתן להחליף אותו.';
  }
  if (TEMPORARY_ERROR_CODES.has(code)) return 'אירעה תקלה זמנית. נסה שוב בעוד רגע.';
  return 'אירעה תקלה זמנית. נסה שוב בעוד רגע.';
};

export const BOOKING_STATUS_LABELS = {
  pending: 'ממתין לאישור',
  approved: 'מאושר',
  confirmed: 'מאושר',
  scheduled: 'מתוזמן',
};
