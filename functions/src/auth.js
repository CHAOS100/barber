import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

const NATIVE_PHONE_AUTH_CORS_ORIGINS = [
  'https://barber-sigma-five.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'https://localhost',
  'capacitor://localhost',
];

export const requireCallableAuth = (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
  return request.auth;
};

export const requireActiveAdminUid = async (uid) => {
  const normalizedUid = String(uid || '').trim();
  if (!normalizedUid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
  const snapshot = await getFirestore().doc(`admins/${normalizedUid}`).get();
  const admin = snapshot.data();
  if (!snapshot.exists || admin?.role !== 'admin' || admin?.active !== true) {
    throw new HttpsError('permission-denied', 'Active admin access is required.');
  }
  return { uid: normalizedUid, profile: admin };
};

export const requireActiveAdmin = async (request) => {
  const auth = requireCallableAuth(request);
  await requireActiveAdminUid(auth.uid);
  return auth;
};

const cleanPhoneNumber = (value) => String(value || '').trim();

export const requirePhoneCustomerAuth = async (request) => {
  const auth = requireCallableAuth(request);
  const provider = auth.token.firebase?.sign_in_provider;
  const nativePhoneAuth = auth.token.native_phone_auth === true;
  let phoneNumber = cleanPhoneNumber(auth.token.phone_number);

  if (provider === 'phone' && phoneNumber) {
    return { ...auth, phoneNumber, authProvider: 'phone' };
  }

  if (nativePhoneAuth) {
    phoneNumber = cleanPhoneNumber(auth.token.native_phone_number || phoneNumber);

    if (!phoneNumber) {
      const userRecord = await getAuth().getUser(auth.uid);
      phoneNumber = cleanPhoneNumber(userRecord.phoneNumber);
    }

    if (phoneNumber) {
      return { ...auth, phoneNumber, authProvider: 'native-phone' };
    }
  }

  throw new HttpsError('permission-denied', 'Firebase Phone Authentication is required.');
};

export const createWebCustomTokenFromNativeAuth = onCall(
  { cors: NATIVE_PHONE_AUTH_CORS_ORIGINS },
  async (request) => {
    const idToken = String(request.data?.idToken || '').trim();
    if (!idToken) {
      throw new HttpsError('invalid-argument', 'Native Firebase ID token is required.');
    }

    let decodedToken;
    try {
      decodedToken = await getAuth().verifyIdToken(idToken, true);
    } catch (error) {
      logger.warn('Native phone auth bridge token verification failed', {
        code: error?.code || 'unknown',
      });
      throw new HttpsError('unauthenticated', 'Native Firebase authentication is required.');
    }

    const userRecord = await getAuth().getUser(decodedToken.uid);
    const phoneNumber = cleanPhoneNumber(userRecord.phoneNumber || decodedToken.phone_number);
    const hasPhoneProvider = userRecord.providerData.some((provider) => provider.providerId === 'phone');

    if (!phoneNumber || !hasPhoneProvider) {
      throw new HttpsError('permission-denied', 'A Firebase phone-authenticated user is required.');
    }

    const customToken = await getAuth().createCustomToken(decodedToken.uid, {
      native_phone_auth: true,
      native_phone_number: phoneNumber,
    });

    logger.info('Native phone auth bridged to Firebase Web custom token', {
      uid: decodedToken.uid,
    });

    return {
      customToken,
      uid: decodedToken.uid,
      phoneNumber,
    };
  },
);
