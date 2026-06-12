import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { ensureFirebaseAdmin } from '../lib/firebase';

export default function AdminRoute() {
  const location = useLocation();
  const { isAdmin, logoutUser } = useCurrentUser();
  const [firebaseAuthorized, setFirebaseAuthorized] = useState(false);
  const [authorizationChecked, setAuthorizationChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!isAdmin) {
      setFirebaseAuthorized(false);
      setAuthorizationChecked(true);
      return () => {
        cancelled = true;
      };
    }

    setAuthorizationChecked(false);
    ensureFirebaseAdmin()
      .then(() => {
        if (cancelled) return;
        setFirebaseAuthorized(true);
        setAuthorizationChecked(true);
      })
      .catch((error) => {
        console.error('[Firebase] Admin route authorization failed', {
          code: error?.code || 'unknown',
          reason: error?.reason || 'unknown',
          message: error?.message || 'Unknown Firebase error',
        });
        if (cancelled) return;
        logoutUser();
        setFirebaseAuthorized(false);
        setAuthorizationChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isAdmin, logoutUser]);

  if (!authorizationChecked) return null;

  if (!isAdmin || !firebaseAuthorized) {
    return <Navigate to="/login" replace state={{ next: location.pathname, admin: true }} />;
  }

  return <Outlet />;
}
