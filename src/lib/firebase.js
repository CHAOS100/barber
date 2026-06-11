import { getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';

const FIREBASE_APP_NAME = 'ost-barber-web';

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

const unauthorizedAdminError = () => {
  return Object.assign(
    new Error('This Firebase user is not an active OST Barber admin.'),
    { code: 'admin/not-authorized' },
  );
};

const validateAdminDocument = async (user) => {
  let adminSnapshot;

  try {
    adminSnapshot = await getDoc(doc(getFirestoreDb(), 'admins', user.uid));
  } catch (error) {
    await signOut(firebaseAuth);
    throw error;
  }

  const adminProfile = adminSnapshot.exists() ? adminSnapshot.data() : null;
  if (adminProfile?.role !== 'admin' || adminProfile?.active !== true) {
    console.error('[Firebase] Admin authorization denied', {
      projectId: firebaseProjectId,
      reason: adminSnapshot.exists() ? 'inactive-or-invalid-role' : 'admin-document-missing',
    });
    await signOut(firebaseAuth);
    throw unauthorizedAdminError();
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
    throw unauthorizedAdminError();
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
