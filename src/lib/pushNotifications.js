/**
 * Push Notification client helper — Phase 1
 *
 * Handles:
 *  - Permission request (with Hebrew explanation, non-aggressive)
 *  - FCM token registration via @capacitor/push-notifications
 *  - Token persistence to Firestore at users/{uid}/pushTokens/{tokenSlug}
 *  - Token refresh
 *
 * Phase 2 (NOT implemented here):
 *  - Foreground notification display handling
 *  - Deep-link routing from notification tap
 *  - Invalid token cleanup Cloud Function
 *  - iOS background modes / APNS certificate setup
 *
 * Separation of concerns:
 *  SMS is ONLY used for Firebase Phone Auth (OTP).
 *  All business reminders / appointment alerts use push + in-app only.
 */

import { Capacitor } from '@capacitor/core';
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions, getFirestoreDb } from '@/lib/firebase';

// ── Platform detection ────────────────────────────────────────────────────────

export const isNativePlatform = () => Capacitor.isNativePlatform();
export const getPlatformName = () => Capacitor.getPlatform(); // 'android' | 'ios' | 'web'

const pushDebug = (message, details = {}) => {
  console.log('[PUSH_DEBUG]', message, details);
};

const maskToken = (token) => (
  token ? `${String(token).slice(0, 8)}...${String(token).slice(-6)}` : ''
);

// ── Push token Firestore helpers ──────────────────────────────────────────────

/**
 * Save (or refresh) a push token for the authenticated customer.
 * Path: users/{uid}/pushTokens/{tokenSlug}
 * @param {string} uid  Firebase Auth UID
 * @param {string} token  FCM device token
 */
/**
 * Try to invoke the registerPushToken Cloud Function callable to perform
 * server-side cross-user token cleanup. Falls back silently if not deployed.
 * @param {string} uid
 * @param {string} token
 * @param {string} platform
 */
const tryRegisterPushTokenViaCallable = async (uid, token, platform) => {
  try {
    const callable = httpsCallable(getFirebaseFunctions(), 'registerPushToken');
    await callable({ token, platform });
    pushDebug('cross-user token cleanup callable succeeded', {
      uid,
      tokenMasked: maskToken(token),
    });
  } catch (err) {
    // NOT_FOUND = callable not yet deployed; other errors are also non-fatal
    pushDebug('cross-user token cleanup callable skipped or failed', {
      uid,
      tokenMasked: maskToken(token),
      errorCode: err?.code || 'unknown',
    });
  }
};

export const savePushToken = async (uid, token) => {
  if (!uid || !token) return;
  // Use first 80 chars of token as document ID (tokens can be very long)
  const tokenSlug = token.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || 'device';
  const platform = getPlatformName();

  const ref = doc(getFirestoreDb(), 'users', uid, 'pushTokens', tokenSlug);
  pushDebug('[PUSH_TOKEN_REGISTER] client saving push token', {
    uid,
    tokenPath: `users/${uid}/pushTokens/${tokenSlug}`,
    tokenSuffix: maskToken(token),
    platform,
  });
  await setDoc(ref, {
    token,
    ownerUid: uid,       // explicit owner — allows cross-user verification in pushProcessor
    platform,
    enabled: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  }, { merge: true });
  pushDebug('[PUSH_TOKEN_REGISTER] client push token saved', {
    uid,
    tokenPath: `users/${uid}/pushTokens/${tokenSlug}`,
    platform,
  });

  // Best-effort: ask the server to disable this token under any other UID.
  // This prevents stale tokens from delivering another user's notifications to this device.
  await tryRegisterPushTokenViaCallable(uid, token, platform);
};

const ensureAndroidNotificationChannel = async (PushNotifications) => {
  if (getPlatformName() !== 'android') return;
  try {
    await PushNotifications.createChannel({
      id: 'appointments',
      name: 'תורים ועדכונים',
      description: 'התראות תורים ועדכונים מ-OST BARBER',
      importance: 5,
      visibility: 1,
      sound: 'default',
      vibration: true,
    });
    pushDebug('android notification channel ensured', {
      channelId: 'appointments',
    });
  } catch (error) {
    console.warn('[PUSH_DEBUG]', 'android notification channel creation failed', {
      channelId: 'appointments',
      errorCode: error?.code || 'unknown',
      errorMessage: error?.message || String(error),
    });
  }
};

// ── Main push notification setup ──────────────────────────────────────────────

let _registrationListener = null;
let _errorListener = null;

/**
 * Request push notification permission and register the device with FCM.
 * Safe to call multiple times — uses idempotent Firestore setDoc with merge.
 *
 * @param {string} uid  Firebase Auth UID of the logged-in customer
 * @param {{ silent?: boolean }} options
 *   silent: if true, skip permission prompt (only re-registers if already granted)
 * @returns {Promise<{ granted: boolean, token?: string, reason?: string }>}
 */
export const initPushNotifications = async (uid, { silent = false } = {}) => {
  if (!isNativePlatform()) {
    pushDebug('push registration skipped: web not supported', { uidPresent: Boolean(uid) });
    return { granted: false, reason: 'web-not-supported' };
  }

  // Dynamic import keeps this out of the web bundle entirely
  const { PushNotifications } = await import('@capacitor/push-notifications');

  pushDebug('push registration requested', {
    uid,
    platform: getPlatformName(),
    silent,
  });

  // Check existing permission
  let { receive: existingPermission } = await PushNotifications.checkPermissions();
  pushDebug('push permission checked', {
    uid,
    platform: getPlatformName(),
    receive: existingPermission,
  });

  if (existingPermission === 'denied') {
    pushDebug('push registration skipped: permission denied', { uid });
    return { granted: false, reason: 'permission-denied' };
  }

  if (existingPermission !== 'granted' && silent) {
    pushDebug('push registration skipped: silent and not granted', { uid, receive: existingPermission });
    return { granted: false, reason: 'not-requested' };
  }

  if (existingPermission !== 'granted') {
    const { receive } = await PushNotifications.requestPermissions();
    pushDebug('push permission requested', {
      uid,
      platform: getPlatformName(),
      receive,
    });
    if (receive !== 'granted') {
      return { granted: false, reason: 'permission-denied' };
    }
  }

  await ensureAndroidNotificationChannel(PushNotifications);

  // Remove existing listeners to avoid duplicates
  if (_registrationListener) {
    _registrationListener.remove();
    _registrationListener = null;
  }
  if (_errorListener) {
    _errorListener.remove();
    _errorListener = null;
  }

  return new Promise((resolve) => {
    PushNotifications.addListener('registration', async (registration) => {
      const token = registration.value;
      try {
        pushDebug('push registration token received', {
          uid,
          platform: getPlatformName(),
          tokenMasked: maskToken(token),
        });
        if (uid && token) {
          await savePushToken(uid, token);
        }
        resolve({ granted: true, token });
      } catch (error) {
        console.warn('[Push] Token save failed:', error);
        resolve({ granted: true, token, saveError: error.message });
      }
    }).then((listener) => { _registrationListener = listener; });

    PushNotifications.addListener('registrationError', (error) => {
      console.warn('[PUSH_DEBUG]', 'push registration error', {
        uid,
        platform: getPlatformName(),
        errorCode: error?.code || 'unknown',
        errorMessage: error?.error || error?.message || String(error),
      });
      resolve({ granted: false, reason: 'registration-error', error: error.error });
    }).then((listener) => { _errorListener = listener; });

    pushDebug('PushNotifications.register called', {
      uid,
      platform: getPlatformName(),
    });
    PushNotifications.register();
  });
};

/**
 * Mark a push token as disabled in Firestore (e.g., on logout).
 * The Phase 2 sender will skip disabled tokens.
 * @param {string} uid
 * @param {string} token
 */
export const disablePushToken = async (uid, token) => {
  if (!uid || !token) return;
  try {
    const tokenSlug = token.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || 'device';
    const ref = doc(getFirestoreDb(), 'users', uid, 'pushTokens', tokenSlug);
    await setDoc(ref, { enabled: false, updatedAt: serverTimestamp() }, { merge: true });
  } catch {
    // Non-critical — ignore
  }
};

/**
 * Disable ALL active push tokens for a user — call this on logout to prevent
 * stale tokens from delivering a different user's notifications to this device.
 * @param {string} uid
 */
export const disableAllPushTokensForCurrentUser = async (uid) => {
  if (!uid) return;
  try {
    const db = getFirestoreDb();
    const snap = await getDocs(
      query(collection(db, 'users', uid, 'pushTokens'), where('enabled', '==', true)),
    );
    if (snap.empty) {
      pushDebug('[PUSH_TOKEN_REGISTER] logout: no active tokens to disable', { uid });
      return;
    }
    const batch = writeBatch(db);
    snap.docs.forEach((tokenDoc) => {
      batch.update(tokenDoc.ref, {
        enabled: false,
        updatedAt: serverTimestamp(),
        disabledAt: serverTimestamp(),
        disabledReason: 'logout',
      });
    });
    await batch.commit();
    pushDebug('[PUSH_TOKEN_REGISTER] logout: push tokens disabled', { uid, count: snap.size });
  } catch (err) {
    console.warn('[PUSH_TOKEN_REGISTER]', 'failed to disable tokens on logout', {
      uid,
      error: err?.message || String(err),
    });
  }
};

/**
 * Check current push permission status without prompting.
 * @returns {Promise<'granted' | 'denied' | 'prompt' | 'web'>}
 */
export const getPushPermissionStatus = async () => {
  if (!isNativePlatform()) return 'web';
  const { PushNotifications } = await import('@capacitor/push-notifications');
  const { receive } = await PushNotifications.checkPermissions();
  return receive;
};

/**
 * Hebrew explanation to show to the customer before requesting push permission.
 * Display this in a confirmation dialog before calling initPushNotifications().
 */
export const PUSH_PERMISSION_EXPLANATION_HE =
  'כדי לקבל תזכורות לתורים ועדכונים מהספר, אפשר להפעיל התראות. ניתן לשנות זאת בכל עת בהגדרות.';
