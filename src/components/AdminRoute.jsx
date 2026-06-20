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

  if (!isAdmin) {
    // Customer or unauthenticated user visiting an admin route — send to home, not admin login.
    // Sending them to admin login with state.admin=true causes a circular redirect loop
    // where successful customer OTP login then navigates back to /admin and loops.
    return <Navigate to="/" replace />;
  }

  if (!firebaseAuthorized) {
    // Was admin (store says so) but Firebase check failed → re-authenticate as admin.
    return <Navigate to="/login" replace state={{ next: location.pathname, admin: true }} />;
  }

  return <Outlet />;
}
