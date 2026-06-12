import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from '@/lib/PageNotFound';
import { useState } from 'react';
import SplashScreen from './components/SplashScreen';

// Pages
import Home from './pages/Home';
import Booking from './pages/Booking';
import Gallery from './pages/Gallery';
import Appointments from './pages/Appointments';
import Profile from './pages/Profile';
import Reviews from './pages/Reviews';
import Notifications from './pages/Notifications';
import OTPLogin from './pages/OTPLogin';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

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

// Layout
import AppLayout from './components/layout/AppLayout';
import AdminRoute from './components/AdminRoute';

function App() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <QueryClientProvider client={queryClientInstance}>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/login" element={<OTPLogin />} />
            <Route path="/email-login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
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
