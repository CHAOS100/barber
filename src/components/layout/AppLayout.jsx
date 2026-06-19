import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import BottomNav from './BottomNav';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import GoldButton from '@/components/ui/GoldButton';
import CustomerNotificationPopup from '@/components/notifications/CustomerNotificationPopup';

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, adminPreview, exitAdminPreview } = useCurrentUser();

  React.useEffect(() => {
    if (isAdmin && !adminPreview && !location.pathname.startsWith('/admin')) {
      navigate('/admin', { replace: true });
    }
  }, [adminPreview, isAdmin, location.pathname, navigate]);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {isAdmin && adminPreview && (
        <div className="sticky top-0 z-40 glass border-b border-white/10 px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-bold text-primary">תצוגת צד לקוח</span>
          <GoldButton
            size="sm"
            onClick={() => {
              exitAdminPreview();
              navigate('/admin');
            }}
          >
            חזרה לניהול
          </GoldButton>
        </div>
      )}
      <main className="app-content">
        <Outlet />
      </main>
      <CustomerNotificationPopup />
      <BottomNav />
    </div>
  );
}
