import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  firebaseAuth,
  findActiveFirebaseAdminProfile,
  isFirebaseConfigured,
  resolveFirebaseUserPhoneNumber,
} from '@/lib/firebase';
import {
  customerProfileToSession,
  subscribeToCurrentCustomerProfile,
} from '@/lib/customerProfilesFirestore';
import { loginUser, logoutUser } from '@/lib/userStore';
import { initPushNotifications, isNativePlatform } from '@/lib/pushNotifications';

const adminProfileToSession = (firebaseUser, profile) => ({
  uid: firebaseUser.uid,
  name: String(profile?.name || 'מנהל').trim(),
  email: String(profile?.email || firebaseUser.email || '').trim(),
  phoneNumber: String(profile?.phoneNumber || firebaseUser.phoneNumber || '').trim(),
  role: 'admin',
  isAdmin: true,
  authProvider: firebaseUser.providerData?.[0]?.providerId || 'firebase',
});

export default function CustomerSessionHydrator() {
  useEffect(() => {
    if (!isFirebaseConfigured || !firebaseAuth) return undefined;

    let unsubscribeProfile = () => {};
    let authRunId = 0;
    const unsubscribeAuth = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      authRunId += 1;
      const runId = authRunId;
      unsubscribeProfile();
      unsubscribeProfile = () => {};
      if (!firebaseUser) {
        logoutUser();
        return;
      }

      Promise.resolve()
        .then(async () => {
          const adminProfile = await findActiveFirebaseAdminProfile(firebaseUser);
          if (runId !== authRunId) return;
          if (adminProfile) {
            loginUser(adminProfileToSession(firebaseUser, adminProfile));
            return;
          }

          const phoneNumber = await resolveFirebaseUserPhoneNumber(firebaseUser);
          if (runId !== authRunId) return;
          if (!phoneNumber) {
            logoutUser();
            return;
          }

          let pushRegistered = false;
          unsubscribeProfile = subscribeToCurrentCustomerProfile((profile) => {
            if (runId !== authRunId) return;
            if (profile) {
              loginUser(customerProfileToSession(profile));
              // Re-register push token once per auth session (silent — won't prompt).
              // Refreshes stale/rotated tokens without asking for permission again.
              if (isNativePlatform() && !pushRegistered) {
                pushRegistered = true;
                initPushNotifications(firebaseUser.uid, { silent: true }).catch(() => {});
              }
            } else {
              logoutUser();
            }
          }, (error) => {
            console.error('[Customer Auth] session hydration failed', {
              code: error?.code || 'unknown',
              message: error?.message || 'Unknown profile error',
            });
            if (runId === authRunId) logoutUser();
          });
        })
        .catch((error) => {
          if (runId !== authRunId) return;
          console.error('[Customer Auth] session hydration failed', {
            code: error?.code || 'unknown',
            message: error?.message || 'Unknown profile error',
          });
          logoutUser();
        });
    });

    return () => {
      unsubscribeProfile();
      unsubscribeAuth();
    };
  }, []);

  return null;
}
