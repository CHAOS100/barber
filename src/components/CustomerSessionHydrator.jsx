import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { firebaseAuth, isFirebaseConfigured } from '@/lib/firebase';
import {
  customerProfileToSession,
  subscribeToCurrentCustomerProfile,
} from '@/lib/customerProfilesFirestore';
import { loginUser, logoutUser, userStore } from '@/lib/userStore';

export default function CustomerSessionHydrator() {
  useEffect(() => {
    if (!isFirebaseConfigured || !firebaseAuth) return undefined;

    let unsubscribeProfile = () => {};
    const unsubscribeAuth = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      unsubscribeProfile();
      unsubscribeProfile = () => {};
      const localUser = userStore.getState().currentUser;
      if (!firebaseUser) {
        if (localUser?.isAdmin !== true) logoutUser();
        return;
      }
      if (!firebaseUser.phoneNumber) return;

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
    });

    return () => {
      unsubscribeProfile();
      unsubscribeAuth();
    };
  }, []);

  return null;
}
