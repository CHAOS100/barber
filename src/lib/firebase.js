import { getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { logoutUser, userStore } from './userStore';

const FIREBASE_APP_NAME = 'ost-barber-web';
const EXPECTED_FIREBASE_PROJECT_ID = 'ost-barber-app';
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

let customerAuthPromise;

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

const prepareFirebaseAuth = async () => {
  requireFirebase();
  await setPersistence(firebaseAuth, browserLocalPersistence);
  await firebaseAuth.authStateReady();
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

      if (firebaseAuth.currentUser && !firebaseAuth.currentUser.isAnonymous) {
        await signOut(firebaseAuth);
      }

      if (!firebaseAuth.currentUser) {
        await signInAnonymously(firebaseAuth);
      }

      console.info('[Firebase] Customer authenticated', {
        projectId: firebaseProjectId,
        isAnonymous: firebaseAuth.currentUser.isAnonymous,
      });

      return firebaseAuth.currentUser;
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
