import React from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { AuthorizationProvider, useAuthorization } from '@/components/auth/AuthorizationContext';
import { BusinessProvider, useBusiness } from '@/components/tenant/BusinessContext';
import { canAccessBusiness, isPlatformAdmin } from '@/lib/accessControl';

const RouteLoading = () => (
  <div className="min-h-[100dvh] bg-background flex items-center justify-center" dir="rtl">
    <div className="glass rounded-2xl px-5 py-4 text-sm text-muted-foreground">טוען...</div>
  </div>
);

const AccessDenied = ({ message = 'אין לך הרשאה לצפות באזור זה.' }) => (
  <div className="min-h-[100dvh] bg-background flex items-center justify-center px-5" dir="rtl">
    <div className="dark-card w-full max-w-md rounded-3xl p-6 text-center">
      <h1 className="text-xl font-black">הגישה נדחתה</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </div>
  </div>
);

export function AuthorizationRoute() {
  return (
    <AuthorizationProvider>
      <Outlet />
    </AuthorizationProvider>
  );
}

export function BusinessSlugRoute() {
  const { businessSlug = '' } = useParams();
  return (
    <BusinessProvider businessSlug={businessSlug}>
      <Outlet />
    </BusinessProvider>
  );
}

export function BusinessIdRoute() {
  const { businessId = '' } = useParams();
  return (
    <BusinessProvider businessId={businessId}>
      <Outlet />
    </BusinessProvider>
  );
}

export function BusinessAccessRoute() {
  const { businessId, loading, error, principal } = useBusiness();

  if (loading) return <RouteLoading />;
  if (!principal?.uid) {
    return <AccessDenied message="נדרשת התחברות עסקית. מסך הכניסה הרב-עסקי יחובר בשלב הזהות." />;
  }
  if (error || !canAccessBusiness(principal, businessId)) {
    return <AccessDenied message="המשתמש אינו חבר פעיל בעסק המבוקש." />;
  }
  return <Outlet />;
}

export function PlatformAdminRoute() {
  const { loading, principal } = useAuthorization();

  if (loading) return <RouteLoading />;
  if (!principal?.uid) {
    return <AccessDenied message="נדרשת התחברות מנהל פלטפורמה. מסך הכניסה יחובר בשלב הזהות." />;
  }
  if (!isPlatformAdmin(principal)) {
    return <AccessDenied message="נדרשת הרשאת מנהל פלטפורמה פעילה." />;
  }
  return <Outlet />;
}
