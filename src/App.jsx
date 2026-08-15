import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import PageNotFound from '@/lib/PageNotFound';
import { useState } from 'react';
import SplashScreen from './components/SplashScreen';
import MobileViewportManager from './components/MobileViewportManager';
import CustomerSessionHydrator from './components/CustomerSessionHydrator';

// Pages
import Home from './pages/Home';
import Booking from './pages/Booking';
import Gallery from './pages/Gallery';
import Appointments from './pages/Appointments';
import Profile from './pages/Profile';
import Reviews from './pages/Reviews';
import Notifications from './pages/Notifications';
import OTPLogin from './pages/OTPLogin';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminAppointments from './pages/admin/AdminAppointments';
import AdminServices from './pages/admin/AdminServices';
import AdminAnalytics from './pages/admin/AdminAnalytics';
import AdminCustomers from './pages/admin/AdminCustomers';
import AdminHours from './pages/admin/AdminHours';
import AdminGallery from './pages/admin/AdminGallery';
import AdminSettings from './pages/admin/AdminSettings';
import AdminBarbers from './pages/admin/AdminBarbers';
import AdminWaitingList from './pages/admin/AdminWaitingList';
import AdminMessages from './pages/admin/AdminMessages';

// Layout
import AppLayout from './components/layout/AppLayout';
import AdminRoute from './components/AdminRoute';
import { PHONE_RECAPTCHA_CONTAINER_ID } from '@/lib/firebase';
import ScrollToTop from './components/ScrollToTop';
import {
  AuthorizationRoute,
  BusinessAccessRoute,
  BusinessIdRoute,
  BusinessSlugRoute,
  PlatformAdminRoute,
} from '@/components/tenant/TenantRouteBoundaries';
import TenantPublicLanding from '@/pages/tenant/TenantPublicLanding';
import BusinessWorkspacePage from '@/pages/business/BusinessWorkspacePage';
import PlatformAdminPage from '@/pages/platform/PlatformAdminPage';

function LegacyAppRuntime() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <>
      <CustomerSessionHydrator />
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <Outlet />
    </>
  );
}

function App() {
  return (
    <>
      <button
        type="button"
        id={PHONE_RECAPTCHA_CONTAINER_ID}
        className="firebase-phone-recaptcha-container"
        aria-hidden="true"
        tabIndex={-1}
      />
      <MobileViewportManager />
      <QueryClientProvider client={queryClientInstance}>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ScrollToTop />
          <Routes>
            {/* Multi-tenant foundation. Legacy single-business routes remain intact below. */}
            <Route element={<AuthorizationRoute />}>
              <Route path="/b/:businessSlug" element={<BusinessSlugRoute />}>
                <Route index element={<TenantPublicLanding />} />
              </Route>

              <Route path="/business/:businessId" element={<BusinessIdRoute />}>
                <Route element={<BusinessAccessRoute />}>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<BusinessWorkspacePage section="dashboard" />} />
                  <Route path="appointments" element={<BusinessWorkspacePage section="appointments" />} />
                  <Route path="services" element={<BusinessWorkspacePage section="services" />} />
                  <Route path="staff" element={<BusinessWorkspacePage section="staff" />} />
                  <Route path="customers" element={<BusinessWorkspacePage section="customers" />} />
                  <Route path="settings" element={<BusinessWorkspacePage section="settings" />} />
                </Route>
              </Route>

              <Route element={<PlatformAdminRoute />}>
                <Route path="/platform-admin" element={<PlatformAdminPage />} />
                <Route path="/platform-admin/businesses" element={<PlatformAdminPage section="businesses" />} />
              </Route>
            </Route>

            <Route element={<LegacyAppRuntime />}>
              <Route path="/login" element={<OTPLogin />} />
              <Route path="/email-login" element={<Navigate to="/login" replace />} />
              <Route path="/register" element={<Navigate to="/login" replace />} />
              <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
              <Route path="/reset-password" element={<Navigate to="/login" replace />} />
              <Route element={<AppLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/booking" element={<Booking />} />
                <Route path="/gallery" element={<Gallery />} />
                <Route path="/appointments" element={<Appointments />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/reviews" element={<Reviews />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route element={<AdminRoute />}>
                  <Route path="/admin" element={<AdminDashboard />} />
                  <Route path="/admin/appointments" element={<AdminAppointments />} />
                  <Route path="/admin/services" element={<AdminServices />} />
                  <Route path="/admin/analytics" element={<AdminAnalytics />} />
                  <Route path="/admin/customers" element={<AdminCustomers />} />
                  <Route path="/admin/hours" element={<AdminHours />} />
                  <Route path="/admin/gallery" element={<AdminGallery />} />
                  <Route path="/admin/settings" element={<AdminSettings />} />
                  <Route path="/admin/barbers" element={<AdminBarbers />} />
                  <Route path="/admin/waiting-list" element={<AdminWaitingList />} />
                  <Route path="/admin/messages" element={<AdminMessages />} />
                  <Route path="/admin/reviews" element={<Reviews />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </>
  );
}

export default App;
