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
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase';

// ── Platform detection ────────────────────────────────────────────────────────

export const isNativePlatform = () => Capacitor.isNativePlatform();
export const getPlatformName = () => Capacitor.getPlatform(); // 'android' | 'ios' | 'web'

// ── Push token Firestore helpers ──────────────────────────────────────────────

/**
 * Save (or refresh) a push token for the authenticated customer.
 * Path: users/{uid}/pushTokens/{tokenSlug}
 * @param {string} uid  Firebase Auth UID
 * @param {string} token  FCM device token
 */
export const savePushToken = async (uid, token) => {
  if (!uid || !token) return;
  // Use first 80 chars of token as document ID (tokens can be very long)
  const tokenSlug = token.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || 'device';
  const platform = getPlatformName();

  const ref = doc(getFirestoreDb(), 'users', uid, 'pushTokens', tokenSlug);
  await setDoc(ref, {
    token,
    platform,
    enabled: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  }, { merge: true });
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
    return { granted: false, reason: 'web-not-supported' };
  }

  // Dynamic import keeps this out of the web bundle entirely
  const { PushNotifications } = await import('@capacitor/push-notifications');

  // Check existing permission
  let { receive: existingPermission } = await PushNotifications.checkPermissions();

  if (existingPermission === 'denied') {
    return { granted: false, reason: 'permission-denied' };
  }

  if (existingPermission !== 'granted' && silent) {
    return { granted: false, reason: 'not-requested' };
  }

  if (existingPermission !== 'granted') {
    const { receive } = await PushNotifications.requestPermissions();
    if (receive !== 'granted') {
      return { granted: false, reason: 'permission-denied' };
    }
  }

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
      console.warn('[Push] Registration error:', error);
      resolve({ granted: false, reason: 'registration-error', error: error.error });
    }).then((listener) => { _errorListener = listener; });

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
