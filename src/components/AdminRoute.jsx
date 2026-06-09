import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useCurrentUser';

export default function AdminRoute() {
  const location = useLocation();
  const { isAdmin } = useCurrentUser();

  if (!isAdmin) {
    return <Navigate to="/login" replace state={{ next: location.pathname, admin: true }} />;
  }

  return <Outlet />;
}
