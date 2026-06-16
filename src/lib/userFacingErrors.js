const NETWORK_ERROR_CODES = new Set([
  'auth/network-request-failed',
  'firestore/unavailable',
  'functions/unavailable',
  'unavailable',
  'deadline-exceeded',
]);

const PERMISSION_ERROR_CODES = new Set([
  'permission-denied',
  'firestore/permission-denied',
  'functions/permission-denied',
]);

const normalizeErrorText = (error) =>
  `${error?.code || ''} ${error?.message || ''}`.toLowerCase();

export const getUserFacingErrorMessage = (
  error,
  fallback = 'אירעה תקלה זמנית. נסה שוב.',
) => {
  const code = String(error?.code || '').toLowerCase();
  const text = normalizeErrorText(error);

  if (NETWORK_ERROR_CODES.has(code) || text.includes('network') || text.includes('offline')) {
    return 'בעיה בחיבור. בדוק אינטרנט ונסה שוב.';
  }

  if (
    PERMISSION_ERROR_CODES.has(code)
    || text.includes('permission-denied')
    || text.includes('permission denied')
  ) {
    return 'אין לך הרשאה לבצע פעולה זו.';
  }

  if (
    text.includes('firebase')
    || text.includes('firestore')
    || text.includes('auth/')
    || text.includes('sdk')
    || text.includes('recaptcha')
    || text.includes('collection')
    || text.includes('document')
    || text.includes('emulator')
    || text.includes('stack')
  ) {
    return fallback;
  }

  return error?.message || fallback;
};

export const DATA_LOAD_ERROR_MESSAGE = 'לא הצלחנו לטעון את הנתונים. נסה לרענן.';
export const TEMPORARY_ERROR_MESSAGE = 'אירעה תקלה זמנית. נסה שוב.';
