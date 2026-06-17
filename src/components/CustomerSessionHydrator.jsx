import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  firebaseAuth,
  isFirebaseConfigured,
  resolveFirebaseUserPhoneNumber,
} from '@/lib/firebase';
import {
  customerProfileToSession,
  subscribeToCurrentCustomerProfile,
} from '@/lib/customerProfilesFirestore';
import { loginUser, logoutUser, userStore } from '@/lib/userStore';

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
      const localUser = userStore.getState().currentUser;
      if (!firebaseUser) {
        if (localUser?.isAdmin !== true) logoutUser();
        return;
      }

      resolveFirebaseUserPhoneNumber(firebaseUser)
        .then((phoneNumber) => {
          if (runId !== authRunId || !phoneNumber) return;
          unsubscribeProfile = subscribeToCurrentCustomerProfile((profile) => {
            if (profile) {
              loginUser(customerProfileToSession(profile));
            } else if (localUser?.isAdmin !== true) {
              logoutUser();
            }
          }, (error) => {
            console.error('[Customer Auth] session hydration failed', {
              code: error?.code || 'unknown',
              message: error?.message || 'Unknown profile error',
            });
            if (localUser?.isAdmin !== true) logoutUser();
          });
        })
        .catch((error) => {
          if (runId !== authRunId) return;
          console.error('[Customer Auth] session hydration failed', {
            code: error?.code || 'unknown',
            message: error?.message || 'Unknown profile error',
          });
          if (localUser?.isAdmin !== true) logoutUser();
        });
    });

    return () => {
      unsubscribeProfile();
      unsubscribeAuth();
    };
  }, []);

  return null;
}
