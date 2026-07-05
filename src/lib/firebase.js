import { getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  RecaptchaVerifier,
  setPersistence,
  signInWithCustomToken,
  signInWithPhoneNumber,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  getDocFromServer,
  getFirestore,
  query,
  serverTimestamp as firestoreServerTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { logoutUser, userStore } from './userStore';

const FIREBASE_APP_NAME = 'ost-barber-web';
const EXPECTED_FIREBASE_PROJECT_ID = 'ost-barber-app';
const EXPECTED_FIREBASE_API_KEY = 'AIzaSyDYKVodoIVuB2KDLLYV5q3ihkDudOjqMm4';
const ADMIN_COLLECTION = 'admins';
export const PHONE_RECAPTCHA_CONTAINER_ID = 'firebase-phone-recaptcha';
const PHONE_SMS_COOLDOWN_MS = 60_000;
const MAX_PHONE_SMS_RESEND_ATTEMPTS = 2;
const PHONE_SMS_GUARD_STORAGE_KEY = 'ost_phone_sms_guard';
const NATIVE_PHONE_AUTH_PROVIDER = 'capacitor-native-phone';
const NATIVE_PHONE_BRIDGE_STORAGE_KEY = 'ost_native_phone_bridge_user';

/**
 * @typedef {{ verificationId?: string }} NativePhoneCodeSentEvent
 * @typedef {{ user?: unknown | null }} NativePhoneVerificationCompletedEvent
 */

/** @type {Record<string, string | undefined>} */
const firebaseEnvironment = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** @param {string} name */
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

/** @param {string} apiKey */
const maskApiKey = (apiKey) => {
  if (!apiKey) return 'missing';
  if (apiKey.length <= 8) return 'invalid';
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
};

/** @param {string | null | undefined} phoneNumber */
const maskPhoneNumber = (phoneNumber) => {
  const value = String(phoneNumber || '');
  if (value.length < 5) return 'invalid';
  return `${value.slice(0, 4)}***${value.slice(-3)}`;
};

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = (value) => typeof value === 'object' && value !== null;

/** @param {unknown} error @returns {string} */
export const getErrorCode = (error) => {
  if (isRecord(error) && typeof error.code === 'string') return error.code;
  return 'unknown';
};

/** @param {unknown} error @param {string} [fallback] @returns {string} */
export const getErrorMessage = (error, fallback = 'Unknown Firebase error') => {
  if (error instanceof Error && error.message) return error.message;
  if (isRecord(error) && typeof error.message === 'string' && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) return error;
  return fallback;
};

/** @param {unknown} error @param {string} key @param {number} [fallback] @returns {number} */
export const getErrorNumber = (error, key, fallback = 0) => {
  if (!isRecord(error)) return fallback;
  const value = error[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

/** @param {unknown} error @param {string} [fallback] */
export const serializeFirebaseError = (error, fallback = 'Unknown Firebase error') => {
  const serialized = {
    code: getErrorCode(error),
    message: getErrorMessage(error, fallback),
  };

  if (isRecord(error) && typeof error.reason === 'string') {
    return { ...serialized, reason: error.reason };
  }

  return serialized;
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

console.info('[Firebase] Runtime configuration', JSON.stringify(firebaseRuntimeConfig));

if (missingFirebaseEnvironmentVariables.length > 0 || invalidFirebaseEnvironmentVariables.length > 0) {
  console.error('[Firebase] Invalid Vercel environment configuration', JSON.stringify({
    missing: missingFirebaseEnvironmentVariables,
    invalid: invalidFirebaseEnvironmentVariables,
    runtime: firebaseRuntimeConfig,
  }));
}

const existingFirebaseApp = getApps().find((app) => app.name === FIREBASE_APP_NAME);
const firebaseApp = isFirebaseConfigured
  ? (existingFirebaseApp || initializeApp(firebaseConfig, FIREBASE_APP_NAME))
  : null;

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
export const firestoreDb = firebaseApp ? getFirestore(firebaseApp) : null;
export const firebaseFunctions = firebaseApp ? getFunctions(firebaseApp) : null;
export const firebaseStorage = firebaseApp ? getStorage(firebaseApp) : null;
/** @type {Promise<import('firebase/auth').User> | null | undefined} */
let customerAuthPromise;
/** @type {RecaptchaVerifier | null | undefined} */
let phoneRecaptchaVerifier;
/** @type {number | null | undefined} */
let phoneRecaptchaWidgetId;
/** @type {Promise<number> | null | undefined} */
let phoneRecaptchaRenderPromise;
/** @type {Promise<any> | null | undefined} */
let phoneSmsRequestPromise;
let phoneRecaptchaWasUsed = false;
/** @type {any} */
let activePhoneConfirmationResult;
let activePhoneConfirmationNumber = '';
let phoneSmsCooldownUntil = 0;
let phoneSmsResendAttempts = 0;
/** @type {Array<import('@capacitor/core').PluginListenerHandle>} */
let nativePhoneListenerHandles = [];
/** @type {{ uid: string, phoneNumber: string } | null} */
let nativePhoneBridgeUser = null;

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

export const isCapacitorAndroidNative = () => (
  Capacitor.isNativePlatform()
  && Capacitor.getPlatform() === 'android'
);

/** @param {string} phoneNumber */
export const normalizeIsraeliPhoneNumber = (phoneNumber) => {
  const rawPhoneNumber = String(phoneNumber || '').trim();
  let normalized = rawPhoneNumber
    .replace(/[\u200E\u200F\u202A-\u202E]/g, '')
    .replace(/[^\d+]/g, '');

  // Some RTL/mobile keyboards can leave the plus visually or actually at the end.
  if (normalized.endsWith('+') && !normalized.startsWith('+')) {
    normalized = `+${normalized.slice(0, -1)}`;
  }

  if (/^05\d{8}$/.test(normalized)) {
    return `+972${normalized.slice(1)}`;
  }

  if (/^5\d{8}$/.test(normalized)) {
    return `+972${normalized}`;
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

/** @param {string} code @param {string} message @param {Record<string, unknown>} [details] */
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

const loadNativePhoneBridgeUser = () => {
  if (nativePhoneBridgeUser) return nativePhoneBridgeUser;
  try {
    const stored = JSON.parse(localStorage.getItem(NATIVE_PHONE_BRIDGE_STORAGE_KEY) || 'null');
    if (stored?.uid && stored?.phoneNumber) {
      nativePhoneBridgeUser = {
        uid: String(stored.uid),
        phoneNumber: String(stored.phoneNumber),
      };
    }
  } catch {
    // The bridge is refreshed from the token when localStorage is unavailable.
  }
  return nativePhoneBridgeUser;
};

/** @param {string} uid @param {string} phoneNumber */
const saveNativePhoneBridgeUser = (uid, phoneNumber) => {
  nativePhoneBridgeUser = {
    uid: String(uid || ''),
    phoneNumber: String(phoneNumber || ''),
  };
  try {
    localStorage.setItem(NATIVE_PHONE_BRIDGE_STORAGE_KEY, JSON.stringify(nativePhoneBridgeUser));
  } catch {
    // In-memory bridge is enough for the current session.
  }
};

const clearNativePhoneBridgeUser = () => {
  nativePhoneBridgeUser = null;
  try {
    localStorage.removeItem(NATIVE_PHONE_BRIDGE_STORAGE_KEY);
  } catch {
    // Nothing else is required when localStorage is unavailable.
  }
};

/** @param {import('firebase/auth').User | null | undefined} [user] */
export const getFirebaseUserPhoneNumber = (user = firebaseAuth?.currentUser) => {
  if (!user) return '';
  const directPhone = String(user.phoneNumber || '').trim();
  if (directPhone) return directPhone;
  const bridgedUser = loadNativePhoneBridgeUser();
  return bridgedUser?.uid === user.uid ? bridgedUser.phoneNumber : '';
};

/** @param {import('firebase/auth').User | null | undefined} [user] */
export const resolveFirebaseUserPhoneNumber = async (user = firebaseAuth?.currentUser) => {
  const directPhone = getFirebaseUserPhoneNumber(user);
  if (directPhone) return directPhone;
  if (!user) return '';

  try {
    const tokenResult = await user.getIdTokenResult();
    const bridgedPhone = String(tokenResult.claims?.native_phone_number || '').trim();
    if (bridgedPhone) {
      saveNativePhoneBridgeUser(user.uid, bridgedPhone);
      return bridgedPhone;
    }
  } catch (error) {
    console.warn('[Firebase Phone Auth] Failed to resolve bridged phone number', JSON.stringify({
      code: getErrorCode(error),
    }));
  }

  return '';
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

/** @param {string} [reason] */
const resetRenderedPhoneRecaptcha = (reason = 'reuse') => {
  if (phoneRecaptchaWidgetId === null || phoneRecaptchaWidgetId === undefined) return;
  try {
    const grecaptcha = /** @type {any} */ (window).grecaptcha;
    grecaptcha?.reset?.(phoneRecaptchaWidgetId);
    console.info('[Firebase Phone Auth] Recaptcha reset', JSON.stringify({
      reason,
      widgetId: phoneRecaptchaWidgetId,
    }));
  } catch (error) {
    console.warn('[Firebase Phone Auth] Recaptcha reset failed', JSON.stringify({
      reason,
      ...serializeFirebaseError(error, 'Unknown reCAPTCHA error'),
    }));
  }
};

const getOrCreatePhoneRecaptchaVerifier = async () => {
  await prepareFirebaseAuth();
  ensurePhoneRecaptchaContainer();

  if (phoneRecaptchaVerifier) {
    console.info('[Firebase Phone Auth] Recaptcha reused', JSON.stringify({
      widgetId: phoneRecaptchaWidgetId ?? null,
      rendered: Boolean(phoneRecaptchaRenderPromise),
    }));
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
      console.info('[Firebase Phone Auth] Recaptcha initialized', JSON.stringify({
        widgetId,
        mode: 'invisible',
        containerId: PHONE_RECAPTCHA_CONTAINER_ID,
      }));
      return widgetId;
    })
    .catch((error) => {
      clearFirebasePhoneRecaptcha('render-failed');
      throw error;
    });

  await phoneRecaptchaRenderPromise;
  return phoneRecaptchaVerifier;
};

/** @param {string} [reason] */
export const resetFirebasePhoneRecaptcha = (reason = 'manual-reset') => {
  resetRenderedPhoneRecaptcha(reason);
};

/** @param {string} [reason] */
export const clearFirebasePhoneRecaptcha = (reason = 'manual-clear') => {
  const hadVerifier = Boolean(phoneRecaptchaVerifier);
  try {
    phoneRecaptchaVerifier?.clear();
  } catch (error) {
    console.warn('[Firebase Phone Auth] Recaptcha clear failed', JSON.stringify({
      reason,
      code: getErrorCode(error),
    }));
  }
  phoneRecaptchaVerifier = null;
  phoneRecaptchaWidgetId = null;
  phoneRecaptchaRenderPromise = null;
  phoneRecaptchaWasUsed = false;
  document.getElementById(PHONE_RECAPTCHA_CONTAINER_ID)?.replaceChildren();
  console.info('[Firebase Phone Auth] Recaptcha cleared', JSON.stringify({ reason, hadVerifier }));
};

/** @param {string} [reason] */
const clearNativePhoneAuthListeners = async (reason = 'cleanup') => {
  const handles = nativePhoneListenerHandles;
  nativePhoneListenerHandles = [];
  if (handles.length === 0) return;

  await Promise.all(handles.map(async (handle) => {
    try {
      await handle?.remove?.();
    } catch (error) {
      console.warn('[Firebase Phone Auth] Native listener cleanup failed', JSON.stringify({
        reason,
        code: getErrorCode(error),
      }));
    }
  }));
  console.info('[Firebase Phone Auth] Native phone listeners cleared', JSON.stringify({
    reason,
    count: handles.length,
  }));
};

/** @param {unknown} eventOrError @param {string} [fallbackCode] */
const nativePhoneAuthError = (eventOrError, fallbackCode = 'auth/native-phone-verification-failed') => {
  const rawMessage = getErrorMessage(eventOrError, 'Native phone verification failed.');
  const message = rawMessage || 'Native phone verification failed.';
  const lowerMessage = message.toLowerCase();
  let code = getErrorCode(eventOrError);
  if (code === 'unknown') code = fallbackCode;

  if (lowerMessage.includes('invalid') && lowerMessage.includes('phone')) {
    code = 'auth/invalid-phone-number';
  } else if (lowerMessage.includes('too many') || lowerMessage.includes('quota')) {
    code = 'auth/too-many-requests';
  } else if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
    code = 'auth/network-request-failed';
  } else if (lowerMessage.includes('expired')) {
    code = 'auth/code-expired';
  } else if (lowerMessage.includes('verification code')) {
    code = 'auth/invalid-verification-code';
  } else if (
    lowerMessage.includes('play integrity')
    || lowerMessage.includes('app verification')
    || lowerMessage.includes('appverification')
    || lowerMessage.includes('invalid app credential')
    || lowerMessage.includes('app-not-authorized')
    || lowerMessage.includes('recaptcha')
  ) {
    code = 'auth/native-app-verification-failed';
  }

  return Object.assign(new Error(message), { code });
};

/** @param {unknown} eventOrError */
const explainNativeAppVerificationFailure = (eventOrError) => {
  const message = getErrorMessage(eventOrError, '').toLowerCase();
  const code = getErrorCode(eventOrError);
  const candidates = [];

  if (
    message.includes('play integrity')
    || message.includes('app verification')
    || message.includes('invalid app credential')
    || message.includes('app-not-authorized')
  ) {
    candidates.push('missing-or-wrong-sha256-for-installed-signing-certificate');
    candidates.push('app-not-installed-from-google-play-or-play-integrity-not-trusted');
  }
  if (message.includes('recaptcha') || message.includes('captcha')) {
    candidates.push('firebase-android-sdk-used-recaptcha-fallback');
    candidates.push('sha1-required-for-recaptcha-fallback-may-be-missing');
  }
  if (message.includes('play services') || message.includes('google play')) {
    candidates.push('google-play-services-missing-disabled-or-outdated');
  }
  if (message.includes('api key') || message.includes('app credential')) {
    candidates.push('api-key-restrictions-may-not-allow-firebaseapp-com');
  }
  if (code !== 'unknown') {
    candidates.push(`firebase-error-code:${code}`);
  }

  return candidates.length > 0
    ? [...new Set(candidates)]
    : [
      'firebase-native-app-verification-failed',
      'check-sha1-sha256-package-name-google-services-json-and-play-integrity',
    ];
};

/** @param {unknown} error */
const isNativeSignedOutError = (error) => (
  getErrorMessage(error, '').toLowerCase().includes('no user is signed in')
  || getErrorCode(error).toLowerCase().includes('no-user')
);

/** @param {number} milliseconds */
const wait = (milliseconds) => new Promise((resolve) => {
  window.setTimeout(resolve, milliseconds);
});

const getNativeFirebaseCurrentUser = async () => {
  if (!isCapacitorAndroidNative()) return null;

  try {
    const result = await FirebaseAuthentication.getCurrentUser();
    if (!result?.user) {
      clearNativePhoneBridgeUser();
      return null;
    }
    return result.user;
  } catch (error) {
    if (isNativeSignedOutError(error)) {
      clearNativePhoneBridgeUser();
      return null;
    }

    console.warn('[Firebase Phone Auth] Native current user check failed', JSON.stringify({
      code: getErrorCode(error),
    }));
    return null;
  }
};

/**
 * @param {{ forceRefresh?: boolean, retries?: number }} [options]
 * @returns {Promise<string | null>}
 */
const getNativeFirebaseIdTokenSafely = async ({
  forceRefresh = true,
  retries = 0,
} = {}) => {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const nativeUser = await getNativeFirebaseCurrentUser();
    if (!nativeUser) {
      if (attempt < retries) {
        await wait(250);
        continue;
      }
      return null;
    }

    try {
      const nativeTokenResult = await FirebaseAuthentication.getIdToken({ forceRefresh });
      const token = String(nativeTokenResult?.token || '');
      return token || null;
    } catch (error) {
      if (isNativeSignedOutError(error)) {
        clearNativePhoneBridgeUser();
        if (attempt < retries) {
          await wait(250);
          continue;
        }
        return null;
      }

      throw error;
    }
  }

  return null;
};

/** @param {string} [reason] @returns {Promise<import('firebase/auth').User | null>} */
const bridgeNativePhoneAuthToWeb = async (reason = 'native-phone-auth') => {
  await prepareFirebaseAuth();

  const nativeIdToken = await getNativeFirebaseIdTokenSafely({
    forceRefresh: true,
    retries: 4,
  });
  if (!nativeIdToken) {
    return null;
  }

  const callable = httpsCallable(getFirebaseFunctions(), 'createWebCustomTokenFromNativeAuth');
  const bridgeResult = await callable({ idToken: nativeIdToken });
  const data = /** @type {{ customToken?: string, uid?: string, phoneNumber?: string }} */ (
    bridgeResult.data || {}
  );
  const customToken = String(data.customToken || '');
  const bridgedPhoneNumber = String(data.phoneNumber || '');

  if (!customToken || !data.uid || !bridgedPhoneNumber) {
    throw Object.assign(
      new Error('Native phone auth bridge returned an invalid response.'),
      { code: 'auth/native-bridge-invalid-response' },
    );
  }

  const webCredential = await signInWithCustomToken(firebaseAuth, customToken);
  saveNativePhoneBridgeUser(webCredential.user.uid, bridgedPhoneNumber);
  customerAuthPromise = null;

  console.info('[Firebase Phone Auth] Native Android auth bridged to Firebase Web SDK', JSON.stringify({
    reason,
    uid: webCredential.user.uid,
    phoneMasked: maskPhoneNumber(bridgedPhoneNumber),
    projectId: firebaseProjectId,
  }));

  return webCredential.user;
};

/**
 * @param {string} normalizedPhoneNumber
 * @param {{ isResend?: boolean }} [options]
 */
const startNativeFirebasePhoneVerification = async (
  normalizedPhoneNumber,
  { isResend = false } = {},
) => {
  await clearNativePhoneAuthListeners('before-native-phone-start');

  try {
    await FirebaseAuthentication.setLanguageCode({ languageCode: 'he' });
  } catch (error) {
    console.warn('[Firebase Phone Auth] Native language setup failed', JSON.stringify({
      code: getErrorCode(error),
    }));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    /** @param {() => Promise<void>} callback */
    const settle = async (callback) => {
      if (settled) return;
      settled = true;
      try {
        await callback();
      } finally {
        await clearNativePhoneAuthListeners('native-phone-request-settled');
      }
    };

    const attachListenersAndStart = async () => {
      /** @param {NativePhoneCodeSentEvent | null | undefined} event */
      const onPhoneCodeSent = (event) => {
        settle(async () => {
          const verificationId = String(event?.verificationId || '');
          if (!verificationId) {
            reject(Object.assign(
              new Error('Native phone verification ID is missing.'),
              { code: 'auth/missing-verification-id' },
            ));
            return;
          }

          const nativeSession = {
            provider: NATIVE_PHONE_AUTH_PROVIDER,
            verificationId,
            phoneNumber: normalizedPhoneNumber,
          };

          console.info('[Firebase Phone Auth] Native Android SMS request succeeded', JSON.stringify({
            path: 'native',
            fallbackUsed: false,
            verificationIdPresent: true,
            phoneMasked: maskPhoneNumber(normalizedPhoneNumber),
            isResend,
          }));

          resolve({
            confirmationResult: nativeSession,
            phoneNumber: normalizedPhoneNumber,
            provider: NATIVE_PHONE_AUTH_PROVIDER,
            reused: false,
          });
        });
      };

      /** @param {NativePhoneVerificationCompletedEvent | null | undefined} event */
      const onPhoneVerificationCompleted = (event) => {
        if (!event?.user) {
          clearNativePhoneBridgeUser();
          return;
        }

        settle(async () => {
          try {
            const firebaseUser = await bridgeNativePhoneAuthToWeb('native-auto-verification');
            if (!firebaseUser) {
              reject(Object.assign(
                new Error('Native Firebase user is not signed in after verification.'),
                { code: 'auth/native-user-not-signed-in' },
              ));
              return;
            }
            resolve({
              confirmationResult: {
                provider: NATIVE_PHONE_AUTH_PROVIDER,
                autoVerified: true,
                phoneNumber: normalizedPhoneNumber,
              },
              phoneNumber: normalizedPhoneNumber,
              provider: NATIVE_PHONE_AUTH_PROVIDER,
              reused: false,
              autoVerified: true,
              firebaseUser,
            });
          } catch (error) {
            reject(error);
          }
        });
      };

      /** @param {unknown} event */
      const onPhoneVerificationFailed = (event) => {
        settle(async () => {
          const normalizedError = nativePhoneAuthError(event);
          console.warn('[Firebase Phone Auth] Native Android verification failed', JSON.stringify({
            platform: 'capacitor-android',
            path: 'native',
            firebaseMayUseBrowserFallback: true,
            fallbackUsedByAppCode: false,
            phoneMasked: maskPhoneNumber(normalizedPhoneNumber),
            code: getErrorCode(normalizedError),
            rootCauseCandidates: explainNativeAppVerificationFailure(event),
          }));
          reject(normalizedError);
        });
      };

      nativePhoneListenerHandles = await Promise.all([
        FirebaseAuthentication.addListener('phoneCodeSent', onPhoneCodeSent),
        FirebaseAuthentication.addListener('phoneVerificationCompleted', onPhoneVerificationCompleted),
        FirebaseAuthentication.addListener('phoneVerificationFailed', onPhoneVerificationFailed),
      ]);

      console.log('REAL FIREBASE SMS REQUEST SENT');
      console.info('[Firebase Phone Auth] Native Android SMS request started', JSON.stringify({
        path: 'native',
        fallbackUsed: false,
        phoneMasked: maskPhoneNumber(normalizedPhoneNumber),
        isResend,
        resendCode: isResend,
      }));

      await FirebaseAuthentication.signInWithPhoneNumber({
        phoneNumber: normalizedPhoneNumber,
        resendCode: isResend,
        skipNativeAuth: false,
        timeout: 60,
      });
    };

    attachListenersAndStart().catch((error) => {
      settle(async () => {
        const normalizedError = nativePhoneAuthError(error);
        console.warn('[Firebase Phone Auth] Native Android SMS start failed', JSON.stringify({
          platform: 'capacitor-android',
          path: 'native',
          firebaseMayUseBrowserFallback: true,
          fallbackUsedByAppCode: false,
          phoneMasked: maskPhoneNumber(normalizedPhoneNumber),
          code: getErrorCode(normalizedError),
          rootCauseCandidates: explainNativeAppVerificationFailure(error),
        }));
        reject(normalizedError);
      });
    });
  });
};

/**
 * @param {string} phoneNumber
 * @param {{ isResend?: boolean }} [options]
 */
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
    console.warn('[Firebase Phone Auth] duplicate SMS request blocked: cooldown active', JSON.stringify({
      cooldownRemainingMs,
    }));
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

  console.info('[Firebase Phone Auth] phone submitted', JSON.stringify({
    phoneMasked: maskPhoneNumber(normalizedPhoneNumber),
    hostname: window.location.hostname,
    projectId: firebaseProjectId,
    isResend,
  }));

  phoneSmsCooldownUntil = Date.now() + PHONE_SMS_COOLDOWN_MS;
  if (isResend) phoneSmsResendAttempts += 1;
  savePhoneSmsGuard();

  phoneSmsRequestPromise = (async () => {
    const useNativeAndroid = isCapacitorAndroidNative();
    console.info('[Firebase Phone Auth] SMS request started', JSON.stringify({
      phoneMasked: maskPhoneNumber(normalizedPhoneNumber),
      isResend,
      platform: useNativeAndroid ? 'capacitor-android' : 'web',
      path: useNativeAndroid ? 'native' : 'web',
      fallbackUsed: false,
    }));

    try {
      if (useNativeAndroid) {
        console.info('[Firebase Phone Auth] native path selected', JSON.stringify({
          platform: 'capacitor-android',
          path: 'native',
          fallbackUsed: false,
          phoneMasked: maskPhoneNumber(normalizedPhoneNumber),
        }));
        const nativeResult = await startNativeFirebasePhoneVerification(normalizedPhoneNumber, { isResend });
        activePhoneConfirmationResult = nativeResult.confirmationResult;
        activePhoneConfirmationNumber = normalizedPhoneNumber;
        if (nativeResult.firebaseUser) {
          customerAuthPromise = null;
          clearPhoneSmsGuard();
        }
        return nativeResult;
      }

      await prepareFirebaseAuth();
      firebaseAuth.languageCode = 'he';
      console.info('[Firebase Phone Auth] web path selected', JSON.stringify({
        platform: 'web',
        path: 'web',
        recaptcha: 'invisible',
        fallbackUsed: false,
        phoneMasked: maskPhoneNumber(normalizedPhoneNumber),
      }));

      const verifier = await getOrCreatePhoneRecaptchaVerifier();
      if (phoneRecaptchaWasUsed) resetRenderedPhoneRecaptcha('sms-request-reuse');
      phoneRecaptchaWasUsed = true;

      console.log('REAL FIREBASE SMS REQUEST SENT');
      console.info('[Firebase Phone Auth] real SMS request details', JSON.stringify({
        phoneMasked: maskPhoneNumber(normalizedPhoneNumber),
        isResend,
      }));
      const confirmationResult = await signInWithPhoneNumber(
        firebaseAuth,
        normalizedPhoneNumber,
        verifier,
      );
      activePhoneConfirmationResult = confirmationResult;
      activePhoneConfirmationNumber = normalizedPhoneNumber;
      console.info('[Firebase Phone Auth] SMS request succeeded', JSON.stringify({
        path: 'web',
        fallbackUsed: false,
        normalizedPhoneMasked: maskPhoneNumber(normalizedPhoneNumber),
        verificationIdPresent: Boolean(confirmationResult.verificationId),
      }));
      return { confirmationResult, phoneNumber: normalizedPhoneNumber, reused: false };
    } catch (error) {
      console.error('[Firebase Phone Auth] SMS request failed', JSON.stringify({
        ...serializeFirebaseError(error, 'Unknown Firebase error'),
        platform: useNativeAndroid ? 'capacitor-android' : 'web',
        path: useNativeAndroid ? 'native' : 'web',
        fallbackUsed: false,
        phoneMasked: maskPhoneNumber(normalizedPhoneNumber),
        recaptchaWidgetId: useNativeAndroid ? null : (phoneRecaptchaWidgetId ?? null),
      }));
      if (!useNativeAndroid) {
        resetRenderedPhoneRecaptcha('sms-request-failed');
      }
      throw error;
    }
  })().finally(() => {
    phoneSmsRequestPromise = null;
  });

  return phoneSmsRequestPromise;
};

/** @param {any} confirmationResult @param {string} code */
export const confirmFirebasePhoneCode = async (confirmationResult, code) => {
  if (!confirmationResult) {
    throw Object.assign(
      new Error('Phone verification session is missing.'),
      { code: 'auth/missing-verification-id' },
    );
  }

  console.info('[Firebase Phone Auth] verification code submitted', JSON.stringify({
    codeLength: String(code || '').trim().length,
    verificationIdPresent: Boolean(confirmationResult.verificationId),
    provider: confirmationResult.provider || 'web',
  }));

  try {
    if (confirmationResult.provider === NATIVE_PHONE_AUTH_PROVIDER) {
      const result = await FirebaseAuthentication.confirmVerificationCode({
        verificationId: confirmationResult.verificationId,
        verificationCode: String(code || '').trim(),
      });
      if (!result?.user) {
        throw Object.assign(
          new Error('Native Firebase user is not signed in after verification.'),
          { code: 'auth/native-user-not-signed-in' },
        );
      }
      const user = await bridgeNativePhoneAuthToWeb('native-manual-code');
      if (!user) {
        throw Object.assign(
          new Error('Native Firebase user is not signed in after verification.'),
          { code: 'auth/native-user-not-signed-in' },
        );
      }
      customerAuthPromise = null;
      clearPhoneSmsGuard();
      console.info('[Firebase Phone Auth] native phone verification completed', JSON.stringify({
        uid: user.uid,
        nativeUserPresent: Boolean(result?.user),
        phoneMasked: maskPhoneNumber(getFirebaseUserPhoneNumber(user)),
      }));
      return user;
    }

    const credential = await confirmationResult.confirm(String(code || '').trim());
    customerAuthPromise = null;
    clearPhoneSmsGuard();
    clearFirebasePhoneRecaptcha('otp-confirmed');
    console.info('[Firebase Phone Auth] phone verification completed', JSON.stringify({
      uid: credential.user.uid,
      phoneMasked: maskPhoneNumber(credential.user.phoneNumber),
    }));
    return credential.user;
  } catch (error) {
    console.error('[Firebase Phone Auth] code verification failed', JSON.stringify({
      ...serializeFirebaseError(error, 'Unknown Firebase error'),
    }));
    throw error;
  }
};

/** @param {unknown} error */
export const getPhoneAuthErrorMessage = (error) => {
  const errorMessage = getErrorMessage(error, '').toLowerCase();
  if (getErrorCode(error) === 'auth/native-app-verification-failed') {
    return 'אימות האפליקציה נכשל. נסה שוב. אם זה חוזר, פנה לעסק.';
  }
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
    getErrorCode(error) === 'auth/operation-not-allowed'
    && errorMessage.includes('region')
  ) {
    return 'שליחת SMS אינה זמינה כרגע. פנה לעסק.';
  }

  const messages = /** @type {Record<string, string>} */ ({
    'auth/captcha-check-failed': 'אימות האבטחה נכשל. נסה שוב.',
    'auth/recaptcha-expired': 'אימות האבטחה נכשל. נסה שוב.',
    'auth/billing-not-enabled': 'שליחת SMS אינה זמינה כרגע. פנה לעסק.',
    'auth/code-expired': 'הקוד פג תוקף. שלח קוד חדש.',
    'auth/invalid-app-credential': 'אימות האפליקציה נכשל. נסה שוב. אם זה חוזר, פנה לעסק.',
    'auth/invalid-phone-number': 'מספר הטלפון לא תקין',
    'auth/missing-native-id-token': 'אימות הטלפון נכשל. נסה שוב.',
    'auth/native-bridge-invalid-response': 'אימות הטלפון נכשל. נסה שוב.',
    'auth/native-app-verification-failed': 'אימות האפליקציה נכשל. נסה שוב. אם זה חוזר, פנה לעסק.',
    'auth/native-phone-verification-failed': 'אימות הטלפון נכשל. נסה שוב.',
    'auth/native-user-not-signed-in': 'אימות הטלפון נכשל. נסה שוב.',
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
    'auth/operation-not-allowed': 'התחברות באמצעות טלפון אינה זמינה כרגע.',
    'auth/quota-exceeded': 'מכסת הודעות ה-SMS הסתיימה. יש לנסות מאוחר יותר.',
    'auth/too-many-requests': 'בוצעו יותר מדי ניסיונות. נסה שוב מאוחר יותר.',
    'auth/unauthorized-domain': 'התחברות אינה זמינה מהכתובת הנוכחית.',
  });

  return messages[getErrorCode(error)] || 'שליחת קוד האימות נכשלה. נסה שוב.';
};

/** @param {string} reason */
const unauthorizedAdminError = (reason) => {
  return Object.assign(
    new Error('This Firebase user is not an active OST Barber admin.'),
    { code: 'admin/not-authorized', reason },
  );
};

/** @param {string} reason */
const clearStaleLocalAdminSession = (reason) => {
  const localUser = userStore.getState().currentUser;
  if (localUser?.isAdmin !== true) return;

  console.warn('[Firebase] Clearing stale local admin session', JSON.stringify({
    reason,
    localAdminUid: localUser.uid || null,
    firebaseCurrentUserUid: firebaseAuth?.currentUser?.uid || null,
  }));
  logoutUser();
};

/**
 * @param {{ exists: () => boolean }} adminSnapshot
 * @param {{ role?: unknown, active?: unknown } | null} adminProfile
 */
const getAdminRejectionReason = (adminSnapshot, adminProfile) => {
  if (!adminSnapshot.exists()) return 'admin-document-missing';
  if (typeof adminProfile?.role !== 'string') return 'admin-role-is-not-a-string';
  if (adminProfile.role !== 'admin') return 'admin-role-is-not-admin';
  if (typeof adminProfile?.active !== 'boolean') return 'admin-active-is-not-a-boolean';
  if (adminProfile.active !== true) return 'admin-is-not-active';
  return null;
};

/** @param {import('firebase/auth').User} user */
const validateAdminDocument = async (user) => {
  const currentUserUid = firebaseAuth.currentUser?.uid || null;
  const adminDocPath = `${ADMIN_COLLECTION}/${user.uid}`;
  const authProjectId = firebaseAuth.app.options.projectId || null;
  const firestoreProjectId = getFirestoreDb().app.options.projectId || null;

  console.info('[Firebase] Admin authorization check', JSON.stringify({
    currentUserUid,
    requestedUserUid: user.uid,
    adminDocPath,
    authProjectId,
    firestoreProjectId,
  }));

  if (currentUserUid !== user.uid) {
    const reason = 'firebase-current-user-uid-mismatch';
    console.error('[Firebase] Admin authorization denied', JSON.stringify({
      reason,
      currentUserUid,
      requestedUserUid: user.uid,
      adminDocPath,
    }));
    clearStaleLocalAdminSession(reason);
    await signOut(firebaseAuth);
    throw unauthorizedAdminError(reason);
  }

  if (
    authProjectId !== EXPECTED_FIREBASE_PROJECT_ID
    || firestoreProjectId !== EXPECTED_FIREBASE_PROJECT_ID
  ) {
    const reason = 'firebase-project-mismatch';
    console.error('[Firebase] Admin authorization denied', JSON.stringify({
      reason,
      expectedProjectId: EXPECTED_FIREBASE_PROJECT_ID,
      authProjectId,
      firestoreProjectId,
      currentUserUid,
      adminDocPath,
    }));
    clearStaleLocalAdminSession(reason);
    await signOut(firebaseAuth);
    throw unauthorizedAdminError(reason);
  }

  let adminSnapshot;

  try {
    // Force an authoritative server read so a stale browser cache cannot decide admin access.
    adminSnapshot = await getDocFromServer(doc(getFirestoreDb(), ADMIN_COLLECTION, user.uid));
  } catch (error) {
    console.error('[Firebase] Admin document read failed', JSON.stringify({
      reason: 'admin-document-read-failed',
      currentUserUid,
      adminDocPath,
      projectId: firestoreProjectId,
      ...serializeFirebaseError(error, 'Unknown Firestore error'),
    }));
    clearStaleLocalAdminSession('admin-document-read-failed');
    await signOut(firebaseAuth);
    throw error;
  }

  const adminProfile = adminSnapshot.exists() ? adminSnapshot.data() : null;
  console.info('[Firebase] Admin authorization document received', JSON.stringify({
    currentUserUid,
    adminDocPath,
    adminDocExists: adminSnapshot.exists(),
    adminDocData: adminProfile,
  }));

  const rejectionReason = getAdminRejectionReason(adminSnapshot, adminProfile);
  if (rejectionReason) {
    console.error('[Firebase] Admin authorization denied', JSON.stringify({
      reason: rejectionReason,
      projectId: firestoreProjectId,
      currentUserUid,
      adminDocPath,
      adminDocExists: adminSnapshot.exists(),
      adminDocData: adminProfile,
    }));
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
      const phoneNumber = await resolveFirebaseUserPhoneNumber(user);
      if (!phoneNumber || user?.isAnonymous) {
        if (userStore.getState().currentUser?.isAdmin !== true) {
          logoutUser();
        }
        throw Object.assign(
          new Error('Customer must authenticate with Firebase Phone Auth.'),
          { code: 'customer/not-authenticated' },
        );
      }

      console.info('[Firebase] Customer authenticated', JSON.stringify({
        projectId: firebaseProjectId,
        uid: user.uid,
        provider: 'phone',
        nativeBridge: user.phoneNumber ? false : true,
      }));

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
    console.error('[Firebase] Admin authorization denied', JSON.stringify({
      reason,
      projectId: firebaseProjectId,
      currentUserUid: firebaseAuth.currentUser?.uid || null,
      localAdminUid: userStore.getState().currentUser?.uid || null,
    }));
    clearStaleLocalAdminSession(reason);
    throw unauthorizedAdminError(reason);
  }

  await validateAdminDocument(firebaseAuth.currentUser);
  return firebaseAuth.currentUser;
};

/** @param {string} email @param {string} password */
export const signInFirebaseAdmin = async (email, password) => {
  await prepareFirebaseAuth();
  const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
  customerAuthPromise = null;
  const adminProfile = await validateAdminDocument(credential.user);

  console.info('[Firebase] Active admin authenticated', JSON.stringify({
    projectId: firebaseProjectId,
  }));

  return { user: credential.user, profile: adminProfile };
};

/** @param {import('firebase/auth').User} firebaseUser */
export const signInFirebaseAdminWithVerifiedPhoneUser = async (firebaseUser) => {
  customerAuthPromise = null;
  const adminProfile = await validateAdminDocument(firebaseUser);

  console.info('[Firebase] Active admin authenticated with phone', JSON.stringify({
    projectId: firebaseProjectId,
    uid: firebaseUser.uid,
    phoneMasked: maskPhoneNumber(getFirebaseUserPhoneNumber(firebaseUser)),
  }));

  return { user: firebaseUser, profile: adminProfile };
};

/** @param {any} confirmationResult @param {string} code */
export const signInFirebaseAdminWithPhoneCode = async (confirmationResult, code) => {
  const firebaseUser = await confirmFirebasePhoneCode(confirmationResult, code);
  return signInFirebaseAdminWithVerifiedPhoneUser(firebaseUser);
};

/**
 * Disable all active FCM push tokens for a given UID.
 * Called on logout so stale device tokens cannot receive another user's pushes.
 * Non-fatal — a failure here is logged but never blocks the sign-out.
 * @param {string} uid
 */
const disablePushTokensForUid = async (uid) => {
  if (!uid) return;
  try {
    const db = getFirestoreDb();
    const tokensSnap = await getDocs(
      query(
        collection(db, 'users', uid, 'pushTokens'),
        where('enabled', '==', true),
      ),
    );
    if (tokensSnap.empty) return;
    const batch = writeBatch(db);
    tokensSnap.docs.forEach((tokenDoc) => {
      batch.update(tokenDoc.ref, {
        enabled: false,
        updatedAt: firestoreServerTimestamp(),
        disabledAt: firestoreServerTimestamp(),
        disabledReason: 'logout',
      });
    });
    await batch.commit();
    console.info('[Push] Disabled push tokens on logout', JSON.stringify({
      uid,
      count: tokensSnap.size,
    }));
  } catch (err) {
    console.warn('[Push] Failed to disable push tokens on logout', JSON.stringify({
      uid,
      error: err?.message || String(err),
    }));
  }
};

export const signOutFirebaseSession = async () => {
  customerAuthPromise = null;
  clearNativePhoneBridgeUser();
  clearPhoneSmsGuard();
  clearFirebasePhoneRecaptcha('sign-out');

  // Disable this device's push tokens before sign-out so they cannot
  // receive notifications for this user after the session ends.
  // Only do this on native (where push tokens are registered).
  if (Capacitor.isNativePlatform() && firebaseAuth?.currentUser?.uid) {
    await disablePushTokensForUid(firebaseAuth.currentUser.uid);
  }

  if (isCapacitorAndroidNative()) {
    await clearNativePhoneAuthListeners('sign-out');
    try {
      await FirebaseAuthentication.signOut();
    } catch (error) {
      if (!isNativeSignedOutError(error)) {
        console.warn('[Firebase Phone Auth] Native sign-out failed', JSON.stringify({
          code: getErrorCode(error),
        }));
      }
    }
  }
  if (firebaseAuth?.currentUser) {
    await signOut(firebaseAuth);
  }
  logoutUser();
};
