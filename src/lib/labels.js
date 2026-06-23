/**
 * Hebrew display labels for technical/internal enum values stored in Firestore.
 * Use these whenever showing enum values to the barber/admin in the UI.
 */

export const CANCELLATION_REASON_LABELS = {
  admin_cancelled: 'בוטל על ידי הניהול',
  customer_cancelled: 'בוטל על ידי הלקוח',
  customer_replaced_appointment: 'הלקוח קבע תור חדש במקום זה',
  no_show: 'לקוח לא הגיע',
  barber_unavailable: 'הספר לא זמין',
  shop_closed: 'בית העסק סגור',
  payment_not_settled: 'תשלום לא הוסדר',
  system_auto_cancel: 'בוטל אוטומטית על ידי המערכת',
  duplicate: 'כפילות — תור זהה כבר קיים',
  other: 'סיבה אחרת',
};

export const NO_SHOW_ACTION_LABELS = {
  warning: 'אזהרה בלבד',
  payment_required: 'דרוש תשלום 50%',
  block: 'לקוח נחסם',
};

export const APPOINTMENT_STATUS_LABELS = {
  pending: 'ממתין לאישור',
  approved: 'מאושר',
  confirmed: 'מאושר',
  completed: 'הושלם',
  cancelled: 'בוטל',
  no_show: 'לא הגיע',
};

export const CLEAR_ACTION_LABELS = {
  payment: 'ניקוי דרישת תשלום',
  warning: 'ניקוי אזהרה',
  block: 'ניקוי חסימה',
};

/**
 * Returns a human-readable Hebrew label for any technical reason value.
 * Falls back to the raw value if no mapping is found.
 * @param {string | undefined | null} reason
 * @returns {string}
 */
export const getReasonLabel = (reason) => {
  if (!reason) return '';
  const key = String(reason).trim().toLowerCase();
  return (
    CANCELLATION_REASON_LABELS[key]
    || CANCELLATION_REASON_LABELS[reason]
    || NO_SHOW_ACTION_LABELS[key]
    || NO_SHOW_ACTION_LABELS[reason]
    || reason
  );
};

/**
 * Returns a human-readable Hebrew label for a cancellation reason.
 * If the value is a plain Hebrew sentence (not an internal key), returns it as-is.
 * @param {string | undefined | null} reason
 * @returns {string}
 */
export const getCancellationReasonLabel = (reason) => {
  if (!reason) return '';
  const raw = String(reason).trim();
  // If it already looks like Hebrew text (not a snake_case key), return it directly
  if (/[֐-׿]/.test(raw)) return raw;
  return CANCELLATION_REASON_LABELS[raw] || raw;
};
