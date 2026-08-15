import React from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { createAuthorizationPrincipal } from '@/lib/accessControl';
import {
  firebaseAuth,
  prepareFirebaseAuth,
  serializeFirebaseError,
} from '@/lib/firebase';
import { subscribeToPlatformAdmin } from '@/lib/tenantFirestore';

const AuthorizationContext = React.createContext(null);

export function AuthorizationProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = React.useState(null);
  const [platformAdmin, setPlatformAdmin] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let active = true;
    let authGeneration = 0;
    let unsubscribeAuth = () => {};
    let unsubscribePlatformAdmin = () => {};

    prepareFirebaseAuth()
      .then(() => {
        if (!active || !firebaseAuth) return;
        unsubscribeAuth = onAuthStateChanged(firebaseAuth, (nextUser) => {
          authGeneration += 1;
          const generation = authGeneration;
          unsubscribePlatformAdmin();
          unsubscribePlatformAdmin = () => {};
          setFirebaseUser(nextUser);
          setPlatformAdmin(null);
          setError(null);

          if (!nextUser) {
            setLoading(false);
            return;
          }

          setLoading(true);
          unsubscribePlatformAdmin = subscribeToPlatformAdmin(
            nextUser.uid,
            (profile) => {
              if (!active || generation !== authGeneration) return;
              setPlatformAdmin(profile);
              setLoading(false);
            },
            (nextError) => {
              if (!active || generation !== authGeneration) return;
              setError(nextError);
              setLoading(false);
            },
          );
        });
      })
      .catch((nextError) => {
        if (!active) return;
        console.error('[Authorization] Firebase initialization failed', serializeFirebaseError(nextError));
        setError(nextError);
        setLoading(false);
      });

    return () => {
      active = false;
      authGeneration += 1;
      unsubscribeAuth();
      unsubscribePlatformAdmin();
    };
  }, []);

  const principal = React.useMemo(
    () => (firebaseUser ? createAuthorizationPrincipal(firebaseUser, platformAdmin) : null),
    [firebaseUser, platformAdmin],
  );

  const value = React.useMemo(() => ({
    firebaseUser,
    platformAdmin,
    principal,
    loading,
    error,
  }), [error, firebaseUser, loading, platformAdmin, principal]);

  return (
    <AuthorizationContext.Provider value={value}>
      {children}
    </AuthorizationContext.Provider>
  );
}

export const useAuthorization = () => {
  const context = React.useContext(AuthorizationContext);
  if (!context) {
    throw new Error('useAuthorization must be used inside AuthorizationProvider.');
  }
  return context;
};
