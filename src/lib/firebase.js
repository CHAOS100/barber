import { getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  RecaptchaVerifier,
  setPersistence,
  signInWithPhoneNumber,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import { logoutUser, userStore } from './userStore';

const FIREBASE_APP_NAME = 'ost-barber-web';
const EXPECTED_FIREBASE_PROJECT_ID = 'ost-barber-app';
const EXPECTED_FIREBASE_API_KEY = 'AIzaSyDYKVodoIVuB2KDLLYV5q3ihkDudOjqMm4';
const ADMIN_COLLECTION = 'admins';
export const PHONE_RECAPTCHA_CONTAINER_ID = 'firebase-phone-recaptcha';
const PHONE_SMS_COOLDOWN_MS = 60_000;
const MAX_PHONE_SMS_RESEND_ATTEMPTS = 2;
const PHONE_SMS_GUARD_STORAGE_KEY = 'ost_phone_sms_guard';

const firebaseEnvironment = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
};

const readEnvironmentValue = (name) => String(firebaseEnvironment[name] || '').trim();

const firebaseConfig = {
  apiKey: readEnvironmentValue('VITE_FIREBASE_API_KEY'),
  authDomain: readEnvironmentValue('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: readEnvironmentValue('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: readEnvironmentValue('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: readEnvironmentValue('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: readEnvironmentValue('VITE_FIREBASE_APP_ID'),
};

export const missingFirebaseEnvironmentVariables = Object.entries(firebaseEnvironment)
  .filter(([, value]) => !String(value || '').trim())
  .map(([name]) => name);

export const invalidFirebaseEnvironmentVariables = Object.entries(firebaseEnvironment)
  .filter(([name, value]) => String(value || '').trim() === name)
  .map(([name]) => name);

if (firebaseConfig.apiKey && !/^AIza[0-9A-Za-z_-]{35}$/.test(firebaseConfig.apiKey)) {
  invalidFirebaseEnvironmentVariables.push('VITE_FIREBASE_API_KEY');
}

if (firebaseConfig.apiKey !== EXPECTED_FIREBASE_API_KEY) {
  invalidFirebaseEnvironmentVariables.push('VITE_FIREBASE_API_KEY');
}

const maskApiKey = (apiKey) => {
  if (!apiKey) return 'missing';
  if (apiKey.length <= 8) return 'invalid';
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
};

const maskPhoneNumber = (phoneNumber) => {
  const value = String(phoneNumber || '');
  if (value.length < 5) return 'invalid';
  return `${value.slice(0, 4)}***${value.slice(-3)}`;
};

export const firebaseRuntimeConfig = Object.freeze({
  projectId: firebaseConfig.projectId || 'missing',
  authDomain: firebaseConfig.authDomain || 'missing',
  appId: firebaseConfig.appId || 'missing',
  apiKeyMasked: maskApiKey(firebaseConfig.apiKey),
  apiKeyMatchesExpected: firebaseConfig.apiKey === EXPECTED_FIREBASE_API_KEY,
});

export const isFirebaseConfigured =
  missingFirebaseEnvironmentVariables.length === 0
  && invalidFirebaseEnvironmentVariables.length === 0;
export const firebaseProjectId = firebaseConfig.projectId || 'not-configured';

console.info('[Firebase] Runtime configuration', firebaseRuntimeConfig);

if (missingFirebaseEnvironmentVariables.length > 0 || invalidFirebaseEnvironmentVariables.length > 0) {
  console.error('[Firebase] Invalid Vercel environment configuration', {
    missing: missingFirebaseEnvironmentVariables,
    invalid: invalidFirebaseEnvironmentVariables,
    runtime: firebaseRuntimeConfig,
  });
}

const existingFirebaseApp = getApps().find((app) => app.name === FIREBASE_APP_NAME);
const firebaseApp = isFirebaseConfigured
  ? (existingFirebaseApp || initializeApp(firebaseConfig, FIREBASE_APP_NAME))
  : null;

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
export const firestoreDb = firebaseApp ? getFirestore(firebaseApp) : null;
export const firebaseFunctions = firebaseApp ? getFunctions(firebaseApp) : null;
export const firebaseStorage = firebaseApp ? getStorage(firebaseApp) : null;
let customerAuthPromise;
let phoneRecaptchaVerifier;
let phoneRecaptchaWidgetId;
let phoneRecaptchaRenderPromise;
let phoneSmsRequestPromise;
let phoneRecaptchaWasUsed = false;
let activePhoneConfirmationResult;
let activePhoneConfirmationNumber = '';
let phoneSmsCooldownUntil = 0;
let phoneSmsResendAttempts = 0;

const firebaseConfigurationError = () => new Error(
  `Firebase is not configured from valid Vercel build-time environment variables. Missing: ${
    missingFirebaseEnvironmentVariables.join(', ') || 'none'
  }. Invalid: ${invalidFirebaseEnvironmentVariables.join(', ') || 'none'}. Configure them in Vercel and redeploy.`,
);

export const requireFirebase = () => {
  if (!firebaseApp || !firebaseAuth || !firestoreDb) {
    throw firebaseConfigurationError();
  }
};

export const getFirestoreDb = () => {
  requireFirebase();
  return firestoreDb;
};

export const getFirebaseFunctions = () => {
  requireFirebase();
  return firebaseFunctions;
};

export const getFirebaseStorage = () => {
  requireFirebase();
  if (!firebaseStorage) throw firebaseConfigurationError();
  return firebaseStorage;
};

export const prepareFirebaseAuth = async () => {
  requireFirebase();
  await setPersistence(firebaseAuth, browserLocalPersistence);
  await firebaseAuth.authStateReady();
};

export const normalizeIsraeliPhoneNumber = (phoneNumber) => {
  const normalized = String(phoneNumber || '').replace(/[^\d+]/g, '');

  if (/^05\d{8}$/.test(normalized)) {
    return `+972${normalized.slice(1)}`;
  }

  if (/^9725\d{8}$/.test(normalized)) {
    return `+${normalized}`;
  }

  if (/^\+9725\d{8}$/.test(normalized)) {
    return normalized;
  }

  throw Object.assign(
    new Error('Israeli mobile phone number is invalid.'),
    { code: 'auth/invalid-phone-number' },
  );
};

const phoneSmsGuardError = (code, message, details = {}) => Object.assign(
  new Error(message),
  { code, ...details },
);

const loadPhoneSmsGuard = () => {
  try {
    const stored = JSON.parse(sessionStorage.getItem(PHONE_SMS_GUARD_STORAGE_KEY) || 'null');
    phoneSmsCooldownUntil = Math.max(phoneSmsCooldownUntil, Number(stored?.cooldownUntil || 0));
    phoneSmsResendAttempts = Math.max(phoneSmsResendAttempts, Number(stored?.resendAttempts || 0));
  } catch {
    // sessionStorage can be unavailable in restricted browser contexts.
  }
};

const savePhoneSmsGuard = () => {
  try {
    sessionStorage.setItem(PHONE_SMS_GUARD_STORAGE_KEY, JSON.stringify({
      cooldownUntil: phoneSmsCooldownUntil,
      resendAttempts: phoneSmsResendAttempts,
    }));
  } catch {
    // The in-memory guard remains active when sessionStorage is unavailable.
  }
};

const clearPhoneSmsGuard = () => {
  activePhoneConfirmationResult = null;
  activePhoneConfirmationNumber = '';
  phoneSmsCooldownUntil = 0;
  phoneSmsResendAttempts = 0;
  try {
    sessionStorage.removeItem(PHONE_SMS_GUARD_STORAGE_KEY);
  } catch {
    // Nothing else is required when sessionStorage is unavailable.
  }
};

const ensurePhoneRecaptchaContainer = () => {
  let container = document.getElementById(PHONE_RECAPTCHA_CONTAINER_ID);
  if (container) {
    container.classList.add('firebase-phone-recaptcha-container');
    container.setAttribute('aria-hidden', 'true');
    container.setAttribute('tabindex', '-1');
    return container;
  }

  container = document.createElement('button');
  container.setAttribute('type', 'button');
  container.id = PHONE_RECAPTCHA_CONTAINER_ID;
  container.className = 'firebase-phone-recaptcha-container';
  container.setAttribute('aria-hidden', 'true');
  container.tabIndex = -1;
  document.body.appendChild(container);
  return container;
};

const resetRenderedPhoneRecaptcha = (reason = 'reuse') => {
  if (phoneRecaptchaWidgetId === null || phoneRecaptchaWidgetId === undefined) return;
  try {
    const grecaptcha = /** @type {any} */ (window).grecaptcha;
    grecaptcha?.reset?.(phoneRecaptchaWidgetId);
    console.info('[Firebase Phone Auth] Recaptcha reset', {
      reason,
      widgetId: phoneRecaptchaWidgetId,
    });
  } catch (error) {
    console.warn('[Firebase Phone Auth] Recaptcha reset failed', {
      reason,
      code: error?.code || 'unknown',
      message: error?.message || 'Unknown reCAPTCHA error',
    });
  }
};

const getOrCreatePhoneRecaptchaVerifier = async () => {
  await prepareFirebaseAuth();
  ensurePhoneRecaptchaContainer();

  if (phoneRecaptchaVerifier) {
    console.info('[Firebase Phone Auth] Recaptcha reused', {
      widgetId: phoneRecaptchaWidgetId ?? null,
      rendered: Boolean(phoneRecaptchaRenderPromise),
    });
    await phoneRecaptchaRenderPromise;
    return phoneRecaptchaVerifier;
  }

  phoneRecaptchaVerifier = new RecaptchaVerifier(
    firebaseAuth,
    PHONE_RECAPTCHA_CONTAINER_ID,
    {
      size: 'invisible',
      callback: () => console.info('[Firebase Phone Auth] Recaptcha solved'),
      'expired-callback': () => {
        console.warn('[Firebase Phone Auth] Recaptcha expired');
        resetRenderedPhoneRecaptcha('expired');
      },
    },
  );
  phoneRecaptchaRenderPromise = phoneRecaptchaVerifier.render()
    .then((widgetId) => {
      phoneRecaptchaWidgetId = widgetId;
      console.info('[Firebase Phone Auth] Recaptcha initialized', {
        widgetId,
        mode: 'invisible',
        containerId: PHONE_RECAPTCHA_CONTAINER_ID,
      });
      return widgetId;
    })
    .catch((error) => {
      clearFirebasePhoneRecaptcha('render-failed');
      throw error;
    });

  await phoneRecaptchaRenderPromise;
  return phoneRecaptchaVerifier;
};

export const resetFirebasePhoneRecaptcha = (reason = 'manual-reset') => {
  resetRenderedPhoneRecaptcha(reason);
};

export const clearFirebasePhoneRecaptcha = (reason = 'manual-clear') => {
  const hadVerifier = Boolean(phoneRecaptchaVerifier);
  try {
    phoneRecaptchaVerifier?.clear();
  } catch (error) {
    console.warn('[Firebase Phone Auth] Recaptcha clear failed', {
      reason,
      code: error?.code || 'unknown',
    });
  }
  phoneRecaptchaVerifier = null;
  phoneRecaptchaWidgetId = null;
  phoneRecaptchaRenderPromise = null;
  phoneRecaptchaWasUsed = false;
  document.getElementById(PHONE_RECAPTCHA_CONTAINER_ID)?.replaceChildren();
  console.info('[Firebase Phone Auth] Recaptcha cleared', { reason, hadVerifier });
};

export const startFirebasePhoneVerification = async (phoneNumber, { isResend = false } = {}) => {
  const normalizedPhoneNumber = normalizeIsraeliPhoneNumber(phoneNumber);
  loadPhoneSmsGuard();

  if (phoneSmsRequestPromise) {
    console.warn('[Firebase Phone Auth] duplicate SMS request blocked: request in progress');
    return phoneSmsRequestPromise;
  }

  if (!isResend && activePhoneConfirmationResult) {
    if (activePhoneConfirmationNumber !== normalizedPhoneNumber) {
      throw phoneSmsGuardError(
        'auth/sms-session-phone-mismatch',
        'The active verification session belongs to another phone number.',
      );
    }
    console.warn('[Firebase Phone Auth] duplicate SMS request blocked: confirmation already exists');
    return {
      confirmationResult: activePhoneConfirmationResult,
      phoneNumber: activePhoneConfirmationNumber,
      reused: true,
    };
  }

  const cooldownRemainingMs = phoneSmsCooldownUntil - Date.now();
  if (cooldownRemainingMs > 0) {
    console.warn('[Firebase Phone Auth] duplicate SMS request blocked: cooldown active', {
      cooldownRemainingMs,
    });
    throw phoneSmsGuardError(
      'auth/sms-cooldown-active',
      'SMS request cooldown is active.',
      { cooldownRemainingMs },
    );
  }

  if (isResend && phoneSmsResendAttempts >= MAX_PHONE_SMS_RESEND_ATTEMPTS) {
    console.warn('[Firebase Phone Auth] duplicate SMS request blocked: resend limit reached');
    throw phoneSmsGuardError('auth/too-many-requests', 'SMS resend limit reached.');
  }

  if (
    isResend
    && activePhoneConfirmationNumber
    && activePhoneConfirmationNumber !== normalizedPhoneNumber
  ) {
    throw phoneSmsGuardError(
      'auth/sms-session-phone-mismatch',
      'The active verification session belongs to another phone number.',
    );
  }

  console.info('[Firebase Phone Auth] phone submitted', {
    phoneMasked: maskPhoneNumber(normalizedPhoneNumber),
    hostname: window.location.hostname,
    projectId: firebaseProjectId,
    isResend,
  });

  phoneSmsCooldownUntil = Date.now() + PHONE_SMS_COOLDOWN_MS;
  if (isResend) phoneSmsResendAttempts += 1;
  savePhoneSmsGuard();

  phoneSmsRequestPromise = (async () => {
    console.info('[Firebase Phone Auth] SMS request started', {
      phoneMasked: maskPhoneNumber(normalizedPhoneNumber),
      isResend,
    });

    try {
      await prepareFirebaseAuth();
      firebaseAuth.languageCode = 'he';
      console.info('[Firebase Phone Auth] phone normalized', {
        normalizedPhoneMasked: maskPhoneNumber(normalizedPhoneNumber),
      });
      const verifier = await getOrCreatePhoneRecaptchaVerifier();
      if (phoneRecaptchaWasUsed) resetRenderedPhoneRecaptcha('sms-request-reuse');
      phoneRecaptchaWasUsed = true;

      console.log('REAL FIREBASE SMS REQUEST SENT');
      console.info('[Firebase Phone Auth] real SMS request details', {
        phoneMasked: maskPhoneNumber(normalizedPhoneNumber),
        isResend,
      });
      const confirmationResult = await signInWithPhoneNumber(
        firebaseAuth,
        normalizedPhoneNumber,
        verifier,
      );
      activePhoneConfirmationResult = confirmationResult;
      activePhoneConfirmationNumber = normalizedPhoneNumber;
      console.info('[Firebase Phone Auth] SMS request succeeded', {
        normalizedPhoneMasked: maskPhoneNumber(normalizedPhoneNumber),
        verificationIdPresent: Boolean(confirmationResult.verificationId),
      });
      return { confirmationResult, phoneNumber: normalizedPhoneNumber, reused: false };
    } catch (error) {
      console.error('[Firebase Phone Auth] SMS request failed', {
        code: error?.code || 'unknown',
        message: error?.message || 'Unknown Firebase error',
        normalizedPhoneMasked: maskPhoneNumber(normalizedPhoneNumber),
        recaptchaWidgetId: phoneRecaptchaWidgetId ?? null,
      });
      resetRenderedPhoneRecaptcha('sms-request-failed');
      throw error;
    }
  })().finally(() => {
    phoneSmsRequestPromise = null;
  });

  return phoneSmsRequestPromise;
};

export const confirmFirebasePhoneCode = async (confirmationResult, code) => {
  if (!confirmationResult) {
    throw Object.assign(
      new Error('Phone verification session is missing.'),
      { code: 'auth/missing-verification-id' },
    );
  }

  console.info('[Firebase Phone Auth] verification code submitted', {
    codeLength: String(code || '').trim().length,
    verificationIdPresent: Boolean(confirmationResult.verificationId),
  });

  try {
    const credential = await confirmationResult.confirm(String(code || '').trim());
    customerAuthPromise = null;
    clearPhoneSmsGuard();
    clearFirebasePhoneRecaptcha('otp-confirmed');
    console.info('[Firebase Phone Auth] phone verification completed', {
      uid: credential.user.uid,
      phoneMasked: maskPhoneNumber(credential.user.phoneNumber),
    });
    return credential.user;
  } catch (error) {
    console.error('[Firebase Phone Auth] code verification failed', {
      code: error?.code || 'unknown',
      message: error?.message || 'Unknown Firebase error',
    });
    throw error;
  }
};

export const getPhoneAuthErrorMessage = (error) => {
  const errorMessage = String(error?.message || '').toLowerCase();
  if (errorMessage.includes('recaptcha has already been rendered')) {
    return 'אימות האבטחה נכשל. נסה שוב.';
  }
  if (errorMessage.includes('recaptcha') && errorMessage.includes('expired')) {
    return 'אימות האבטחה נכשל. נסה שוב.';
  }
  if (errorMessage.includes('recaptcha')) {
    return 'אימות האבטחה נכשל. נסה שוב.';
  }
  if (
    error?.code === 'auth/operation-not-allowed'
    && errorMessage.includes('region')
  ) {
    return 'שליחת SMS לישראל אינה מאופשרת בהגדרות Firebase. יש לפנות למנהל המערכת.';
  }

  const messages = {
    'auth/captcha-check-failed': 'אימות האבטחה נכשל. נסה שוב.',
    'auth/recaptcha-expired': 'אימות האבטחה נכשל. נסה שוב.',
    'auth/billing-not-enabled': 'שליחת SMS אינה זמינה עד להפעלת חיוב בפרויקט Firebase.',
    'auth/code-expired': 'הקוד פג תוקף. שלח קוד חדש.',
    'auth/invalid-app-credential': 'אימות האבטחה נכשל. נסה שוב.',
    'auth/invalid-phone-number': 'יש להזין מספר טלפון ישראלי תקין.',
    'auth/network-request-failed': 'בעיה בחיבור. נסה שוב.',
    'auth/sms-cooldown-active': 'יש להמתין לפני שליחת קוד נוסף.',
    'auth/sms-session-phone-mismatch': 'כבר נשלח קוד למספר אחר. יש להשלים את האימות הקיים.',
    'auth/invalid-verification-code': 'קוד האימות שגוי.',
    'auth/missing-phone-number': 'יש להזין מספר טלפון.',
    'auth/missing-app-credential': 'אימות האבטחה נכשל. נסה שוב.',
    'auth/missing-verification-code': 'יש להזין את קוד האימות שנשלח.',
    'auth/missing-verification-id': 'הקוד פג תוקף. שלח קוד חדש.',
    'auth/invalid-verification-id': 'הקוד פג תוקף. שלח קוד חדש.',
    'auth/session-expired': 'הקוד פג תוקף. שלח קוד חדש.',
    'auth/operation-not-allowed': 'התחברות באמצעות טלפון או שליחת SMS אינה מופעלת בהגדרות Firebase.',
    'auth/quota-exceeded': 'מכסת הודעות ה-SMS הסתיימה. יש לנסות מאוחר יותר.',
    'auth/too-many-requests': 'בוצעו יותר מדי ניסיונות. נסה שוב מאוחר יותר.',
    'auth/unauthorized-domain': 'כתובת האתר אינה מורשית להתחברות ב-Firebase.',
  };

  return messages[error?.code] || 'שליחת קוד האימות נכשלה. נסה שוב.';
};

const unauthorizedAdminError = (reason) => {
  return Object.assign(
    new Error('This Firebase user is not an active OST Barber admin.'),
    { code: 'admin/not-authorized', reason },
  );
};

const clearStaleLocalAdminSession = (reason) => {
  const localUser = userStore.getState().currentUser;
  if (localUser?.isAdmin !== true) return;

  console.warn('[Firebase] Clearing stale local admin session', {
    reason,
    localAdminUid: localUser.uid || null,
    firebaseCurrentUserUid: firebaseAuth?.currentUser?.uid || null,
  });
  logoutUser();
};

const getAdminRejectionReason = (adminSnapshot, adminProfile) => {
  if (!adminSnapshot.exists()) return 'admin-document-missing';
  if (typeof adminProfile?.role !== 'string') return 'admin-role-is-not-a-string';
  if (adminProfile.role !== 'admin') return 'admin-role-is-not-admin';
  if (typeof adminProfile?.active !== 'boolean') return 'admin-active-is-not-a-boolean';
  if (adminProfile.active !== true) return 'admin-is-not-active';
  return null;
};

const validateAdminDocument = async (user) => {
  const currentUserUid = firebaseAuth.currentUser?.uid || null;
  const adminDocPath = `${ADMIN_COLLECTION}/${user.uid}`;
  const authProjectId = firebaseAuth.app.options.projectId || null;
  const firestoreProjectId = getFirestoreDb().app.options.projectId || null;

  console.info('[Firebase] Admin authorization check', {
    currentUserUid,
    requestedUserUid: user.uid,
    adminDocPath,
    authProjectId,
    firestoreProjectId,
  });

  if (currentUserUid !== user.uid) {
    const reason = 'firebase-current-user-uid-mismatch';
    console.error('[Firebase] Admin authorization denied', {
      reason,
      currentUserUid,
      requestedUserUid: user.uid,
      adminDocPath,
    });
    clearStaleLocalAdminSession(reason);
    await signOut(firebaseAuth);
    throw unauthorizedAdminError(reason);
  }

  if (
    authProjectId !== EXPECTED_FIREBASE_PROJECT_ID
    || firestoreProjectId !== EXPECTED_FIREBASE_PROJECT_ID
  ) {
    const reason = 'firebase-project-mismatch';
    console.error('[Firebase] Admin authorization denied', {
      reason,
      expectedProjectId: EXPECTED_FIREBASE_PROJECT_ID,
      authProjectId,
      firestoreProjectId,
      currentUserUid,
      adminDocPath,
    });
    clearStaleLocalAdminSession(reason);
    await signOut(firebaseAuth);
    throw unauthorizedAdminError(reason);
  }

  let adminSnapshot;

  try {
    // Force an authoritative server read so a stale browser cache cannot decide admin access.
    adminSnapshot = await getDocFromServer(doc(getFirestoreDb(), ADMIN_COLLECTION, user.uid));
  } catch (error) {
    console.error('[Firebase] Admin document read failed', {
      reason: 'admin-document-read-failed',
      currentUserUid,
      adminDocPath,
      projectId: firestoreProjectId,
      code: error?.code || 'unknown',
      message: error?.message || 'Unknown Firestore error',
    });
    clearStaleLocalAdminSession('admin-document-read-failed');
    await signOut(firebaseAuth);
    throw error;
  }

  const adminProfile = adminSnapshot.exists() ? adminSnapshot.data() : null;
  console.info('[Firebase] Admin authorization document received', {
    currentUserUid,
    adminDocPath,
    adminDocExists: adminSnapshot.exists(),
    adminDocData: adminProfile,
  });

  const rejectionReason = getAdminRejectionReason(adminSnapshot, adminProfile);
  if (rejectionReason) {
    console.error('[Firebase] Admin authorization denied', {
      reason: rejectionReason,
      projectId: firestoreProjectId,
      currentUserUid,
      adminDocPath,
      adminDocExists: adminSnapshot.exists(),
      adminDocData: adminProfile,
    });
    clearStaleLocalAdminSession(rejectionReason);
    await signOut(firebaseAuth);
    throw unauthorizedAdminError(rejectionReason);
  }

  return adminProfile;
};

export const ensureFirebaseCustomer = async () => {
  if (!customerAuthPromise) {
    customerAuthPromise = (async () => {
      await prepareFirebaseAuth();
      const user = firebaseAuth.currentUser;
      if (!user?.phoneNumber || user.isAnonymous) {
        if (userStore.getState().currentUser?.isAdmin !== true) {
          logoutUser();
        }
        throw Object.assign(
          new Error('Customer must authenticate with Firebase Phone Auth.'),
          { code: 'customer/not-authenticated' },
        );
      }

      console.info('[Firebase] Customer authenticated', {
        projectId: firebaseProjectId,
        uid: user.uid,
        provider: 'phone',
      });

      return user;
    })().finally(() => {
      customerAuthPromise = null;
    });
  }

  return customerAuthPromise;
};

export const ensureFirebaseAdmin = async () => {
  await prepareFirebaseAuth();

  if (!firebaseAuth.currentUser || firebaseAuth.currentUser.isAnonymous) {
    const reason = !firebaseAuth.currentUser
      ? 'firebase-current-user-missing'
      : 'firebase-current-user-is-anonymous';
    console.error('[Firebase] Admin authorization denied', {
      reason,
      projectId: firebaseProjectId,
      currentUserUid: firebaseAuth.currentUser?.uid || null,
      localAdminUid: userStore.getState().currentUser?.uid || null,
    });
    clearStaleLocalAdminSession(reason);
    throw unauthorizedAdminError(reason);
  }

  await validateAdminDocument(firebaseAuth.currentUser);
  return firebaseAuth.currentUser;
};

export const signInFirebaseAdmin = async (email, password) => {
  await prepareFirebaseAuth();
  const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
  customerAuthPromise = null;
  const adminProfile = await validateAdminDocument(credential.user);

  console.info('[Firebase] Active admin authenticated', {
    projectId: firebaseProjectId,
  });

  return { user: credential.user, profile: adminProfile };
};

export const signOutFirebaseSession = async () => {
  customerAuthPromise = null;
  clearPhoneSmsGuard();
  clearFirebasePhoneRecaptcha('sign-out');
  if (firebaseAuth?.currentUser) {
    await signOut(firebaseAuth);
  }
  logoutUser();
};
