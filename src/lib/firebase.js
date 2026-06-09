import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const requiredFirebaseEnvironment = {
  VITE_FIREBASE_API_KEY: firebaseConfig.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
  VITE_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
  VITE_FIREBASE_STORAGE_BUCKET: firebaseConfig.storageBucket,
  VITE_FIREBASE_MESSAGING_SENDER_ID: firebaseConfig.messagingSenderId,
  VITE_FIREBASE_APP_ID: firebaseConfig.appId,
};

export const missingFirebaseEnvironmentVariables = Object.entries(requiredFirebaseEnvironment)
  .filter(([, value]) => !String(value || '').trim())
  .map(([name]) => name);

export const isFirebaseConfigured = missingFirebaseEnvironmentVariables.length === 0;
export const firebaseProjectId = firebaseConfig.projectId || 'not-configured';

const firebaseApp = isFirebaseConfigured
  ? (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig))
  : null;

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
export const firestoreDb = firebaseApp ? getFirestore(firebaseApp) : null;

let customerAuthPromise;

const firebaseConfigurationError = () => new Error(
  `Firebase is not configured. Missing Vercel build-time environment variables: ${
    missingFirebaseEnvironmentVariables.join(', ') || 'unknown'
  }. Configure them in Vercel and redeploy.`,
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
