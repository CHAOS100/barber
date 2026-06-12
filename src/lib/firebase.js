import { getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  RecaptchaVerifier,
  setPersistence,
  signInAnonymously,
  signInWithPhoneNumber,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { logoutUser, userStore } from './userStore';

const FIREBASE_APP_NAME = 'ost-barber-web';
const EXPECTED_FIREBASE_PROJECT_ID = 'ost-barber-app';
const EXPECTED_FIREBASE_API_KEY = 'AIzaSyDYKVodoIVuB2KDLLYV5q3ihkDudOjqMm4';
const ADMIN_COLLECTION = 'admins';

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
export const isDevDemoOtpEnabled =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEV_DEMO_OTP === 'true';

let customerAuthPromise;
let phoneRecaptchaVerifier;

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

export const resetFirebasePhoneRecaptcha = () => {
  phoneRecaptchaVerifier?.clear();
  phoneRecaptchaVerifier = null;
};

export const startFirebasePhoneVerification = async (phoneNumber, containerId) => {
  await prepareFirebaseAuth();
  const normalizedPhoneNumber = normalizeIsraeliPhoneNumber(phoneNumber);

  resetFirebasePhoneRecaptcha();
  phoneRecaptchaVerifier = new RecaptchaVerifier(firebaseAuth, containerId, {
    size: 'invisible',
  });

  try {
    const confirmationResult = await signInWithPhoneNumber(
      firebaseAuth,
      normalizedPhoneNumber,
      phoneRecaptchaVerifier,
    );
    return { confirmationResult, phoneNumber: normalizedPhoneNumber };
  } catch (error) {
    resetFirebasePhoneRecaptcha();
    throw error;
  }
};

export const confirmFirebasePhoneCode = async (confirmationResult, code) => {
  if (!confirmationResult) {
    throw Object.assign(
      new Error('Phone verification session is missing.'),
      { code: 'auth/missing-verification-id' },
    );
  }

  const credential = await confirmationResult.confirm(String(code || '').trim());
  customerAuthPromise = null;
  resetFirebasePhoneRecaptcha();
  return credential.user;
};

export const signInDevDemoCustomer = async () => {
  if (!isDevDemoOtpEnabled) {
    throw Object.assign(
      new Error('Local development OTP is disabled.'),
      { code: 'auth/operation-not-allowed' },
    );
  }

  await prepareFirebaseAuth();
  if (firebaseAuth.currentUser && !firebaseAuth.currentUser.isAnonymous) {
    await signOut(firebaseAuth);
  }
  if (!firebaseAuth.currentUser) {
    await signInAnonymously(firebaseAuth);
  }
  customerAuthPromise = null;
  return firebaseAuth.currentUser;
};

export const getPhoneAuthErrorMessage = (error) => {
  const messages = {
    'auth/captcha-check-failed': 'אימות האבטחה נכשל. יש לרענן את הדף ולנסות שוב.',
    'auth/code-expired': 'קוד האימות פג תוקף. יש לבקש קוד חדש.',
    'auth/invalid-app-credential': 'אימות האבטחה נכשל. יש לרענן את הדף ולנסות שוב.',
    'auth/invalid-phone-number': 'יש להזין מספר טלפון ישראלי תקין.',
    'auth/invalid-verification-code': 'קוד האימות שגוי. יש לנסות שוב.',
    'auth/missing-phone-number': 'יש להזין מספר טלפון.',
    'auth/missing-verification-code': 'יש להזין את קוד האימות שנשלח.',
    'auth/missing-verification-id': 'בקשת האימות פגה. יש לבקש קוד חדש.',
    'auth/operation-not-allowed': 'התחברות באמצעות טלפון אינה מופעלת ב-Firebase.',
    'auth/quota-exceeded': 'מכסת הודעות ה-SMS הסתיימה. יש לנסות מאוחר יותר.',
    'auth/too-many-requests': 'בוצעו יותר מדי ניסיונות. יש להמתין ולנסות שוב.',
    'auth/unauthorized-domain': 'כתובת האתר אינה מורשית להתחברות ב-Firebase.',
  };

  return messages[error?.code] || 'שליחת קוד האימות נכשלה. יש לנסות שוב.';
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
      const isAllowedDevCustomer = isDevDemoOtpEnabled && user?.isAnonymous;

      if (!user || (!user.phoneNumber && !isAllowedDevCustomer)) {
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
        provider: isAllowedDevCustomer ? 'local-development' : 'phone',
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
