import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const requiredConfig = ['apiKey', 'authDomain', 'projectId', 'appId'];

export const isFirebaseConfigured = requiredConfig.every((key) => Boolean(firebaseConfig[key]));
export const firebaseProjectId = firebaseConfig.projectId || 'not-configured';

const firebaseApp = isFirebaseConfigured
  ? (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig))
  : null;

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
export const firestoreDb = firebaseApp ? getFirestore(firebaseApp) : null;

let customerAuthPromise;

const requireFirebase = () => {
  if (!firebaseApp || !firebaseAuth || !firestoreDb) {
    throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to .env.');
  }
};

const prepareFirebaseAuth = async () => {
  requireFirebase();
  await setPersistence(firebaseAuth, browserLocalPersistence);
  await firebaseAuth.authStateReady();
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
        uid: firebaseAuth.currentUser.uid,
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
    throw new Error('Admin must sign in with Firebase email/password first.');
  }

  return firebaseAuth.currentUser;
};

export const signInFirebaseAdmin = async (email, password) => {
  await prepareFirebaseAuth();
  const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
  customerAuthPromise = null;

  console.info('[Firebase] Admin authenticated', {
    projectId: firebaseProjectId,
    uid: credential.user.uid,
    email: credential.user.email,
  });

  return credential.user;
};
