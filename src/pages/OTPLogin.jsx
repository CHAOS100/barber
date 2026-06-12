import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Phone, ShieldCheck, Lock, Mail } from 'lucide-react';
import { loginUser } from '../lib/userStore';
import { BARBER_PHOTO } from '../lib/mockData';
import GoldButton from '../components/ui/GoldButton';
import {
  confirmFirebasePhoneCode,
  getPhoneAuthErrorMessage,
  isDevDemoOtpEnabled,
  normalizeIsraeliPhoneNumber,
  resetFirebasePhoneRecaptcha,
  signInDevDemoCustomer,
  signInFirebaseAdmin,
  startFirebasePhoneVerification,
} from '@/lib/firebase';

export default function OTPLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const nextPath = location.state?.next || '/';

  // mode: 'customer' | 'admin'
  const [mode, setMode] = useState(location.state?.admin ? 'admin' : 'customer');

  // Customer OTP flow
  const [step, setStep] = useState('phone'); // phone | otp
  const [phone, setPhone] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const confirmationResultRef = useRef(null);

  // Admin login
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => resetFirebasePhoneRecaptcha(), []);

  // ─── Customer OTP ──────────────────────────────────────────────
  const handleSendOTP = async () => {
    if (!name.trim()) { setError('נא להזין שם'); return; }
    setLoading(true);
    setError('');

    try {
      const customerPhone = normalizeIsraeliPhoneNumber(phone);
      setNormalizedPhone(customerPhone);

      if (isDevDemoOtpEnabled) {
        setDevOtp(String(Math.floor(100000 + Math.random() * 900000)));
        confirmationResultRef.current = null;
      } else {
        const result = await startFirebasePhoneVerification(phone, 'customer-phone-recaptcha');
        confirmationResultRef.current = result.confirmationResult;
        setDevOtp('');
      }

      setOtp('');
      setStep('otp');
    } catch (phoneAuthError) {
      console.error('[Firebase] Customer SMS verification failed', {
        code: phoneAuthError?.code || 'unknown',
        message: phoneAuthError?.message || 'Unknown Firebase error',
      });
      setError(getPhoneAuthErrorMessage(phoneAuthError));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) { setError('יש להזין קוד אימות בן 6 ספרות'); return; }
    setLoading(true);

    try {
      let firebaseUser;
      if (isDevDemoOtpEnabled) {
        if (otp !== devOtp) {
          throw Object.assign(new Error('Invalid local development code.'), {
            code: 'auth/invalid-verification-code',
          });
        }
        firebaseUser = await signInDevDemoCustomer();
      } else {
        firebaseUser = await confirmFirebasePhoneCode(confirmationResultRef.current, otp);
      }

      loginUser({
        name: name.trim(),
        phone: normalizedPhone,
        uid: firebaseUser.uid,
        isAdmin: false,
        authProvider: isDevDemoOtpEnabled ? 'local-development' : 'phone',
      });
      navigate(nextPath);
    } catch (phoneAuthError) {
      console.error('[Firebase] Customer phone code verification failed', {
        code: phoneAuthError?.code || 'unknown',
        message: phoneAuthError?.message || 'Unknown Firebase error',
      });
      setError(getPhoneAuthErrorMessage(phoneAuthError));
    } finally {
      setLoading(false);
    }
  };

  // ─── Admin login ────────────────────────────────────────────────
  const handleAdminLogin = async () => {
    setError('');
    if (!adminEmail || !adminPassword) { setError('נא למלא אימייל וסיסמה'); return; }
    setLoading(true);
    try {
      const { user: firebaseUser, profile } = await signInFirebaseAdmin(adminEmail.trim(), adminPassword);
      loginUser({
        name: profile.name || 'מנהל',
        email: profile.email || firebaseUser.email,
        uid: firebaseUser.uid,
        isAdmin: true,
      });
      navigate('/admin');
    } catch (signInError) {
      console.error('[Firebase] Admin sign-in failed', {
        code: signInError?.code || 'unknown',
        message: signInError?.message || 'Unknown Firebase error',
      });

      if (signInError?.code === 'admin/not-authorized') {
        setError('החשבון קיים, אך אינו מוגדר כמנהל פעיל ב-Firestore.');
      } else if (signInError?.message?.includes('Missing Vercel build-time environment variables')) {
        setError('Firebase אינו מוגדר ב-Vercel. יש להגדיר משתני סביבה ולפרוס מחדש.');
      } else {
        setError('התחברות Firebase נכשלה. ודא שחשבון המנהל קיים ומורשה.');
      }
    } finally {
      setLoading(false);
    }
  };

  const switchToAdmin = () => {
    resetFirebasePhoneRecaptcha();
    setMode('admin');
    setError('');
  };
  const switchToCustomer = () => {
    setMode('customer');
    setError('');
    setStep('phone');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          {/* Header */}
          <div className="text-center mb-10">
            <img src={BARBER_PHOTO} alt="OST Barber" className="w-24 h-24 rounded-2xl border-2 border-primary object-cover gold-shadow mx-auto mb-4" />
            <h1 className="text-3xl font-black tracking-tight">OST BARBER</h1>
            <p className="text-muted-foreground mt-1">
              {mode === 'admin' ? 'כניסת מנהל' : 'כניסה לחשבון'}
            </p>
          </div>

          <AnimatePresence mode="wait">

            {/* ─── ADMIN MODE ─── */}
            {mode === 'admin' && (
              <motion.div
                key="admin"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="glass-gold rounded-2xl p-3 mb-2 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-primary flex-shrink-0" />
                  <p className="text-xs text-muted-foreground">גישת מנהל בלבד. לקוחות אינם יכולים להשתמש בממשק זה.</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">אימייל</label>
                  <div className="relative">
                    <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      type="email"
                      value={adminEmail}
                      onChange={e => setAdminEmail(e.target.value)}
                      placeholder="admin@ostbarber.com"
                      className="w-full bg-secondary border border-border rounded-2xl px-4 py-4 pr-12 text-foreground text-right placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">סיסמה</label>
                  <div className="relative">
                    <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      type="password"
                      value={adminPassword}
                      onChange={e => setAdminPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-secondary border border-border rounded-2xl px-4 py-4 pr-12 text-foreground text-right placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                      onKeyDown={e => e.key === 'Enter' && handleAdminLogin()}
                    />
                  </div>
                </div>

                {error && <p className="text-destructive text-sm text-center">{error}</p>}

                <GoldButton onClick={handleAdminLogin} size="lg" className="w-full" disabled={loading}>
                  {loading ? 'מתחבר...' : 'כניסה למערכת ניהול'}
                </GoldButton>

                <button
                  onClick={switchToCustomer}
                  className="flex items-center gap-1 text-muted-foreground text-sm mx-auto"
                >
                  <ArrowRight className="w-4 h-4" /> חזרה לכניסת לקוח
                </button>
              </motion.div>
            )}

            {/* ─── CUSTOMER: PHONE STEP ─── */}
            {mode === 'customer' && step === 'phone' && (
              <motion.div
                key="phone"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">שם מלא</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="ישראל ישראלי"
                    className="w-full bg-secondary border border-border rounded-2xl px-4 py-4 text-foreground text-right placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                    dir="rtl"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">מספר טלפון</label>
                  <div className="relative">
                    <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="054-0000000"
                      className="w-full bg-secondary border border-border rounded-2xl px-4 py-4 pr-12 text-foreground text-right placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                      dir="rtl"
                    />
                  </div>
                </div>
                {error && <p className="text-destructive text-sm text-center">{error}</p>}
                <GoldButton onClick={handleSendOTP} size="lg" className="w-full" disabled={loading}>
                  {loading ? 'שולח...' : 'שלח קוד אימות'}
                </GoldButton>
                <div id="customer-phone-recaptcha" />

                {/* Admin link */}
                <div className="text-center pt-2">
                  <button
                    onClick={switchToAdmin}
                    className="text-muted-foreground/60 text-xs hover:text-primary transition-colors"
                  >
                    כניסת מנהל
                  </button>
                </div>
              </motion.div>
            )}

            {/* ─── CUSTOMER: OTP STEP ─── */}
            {mode === 'customer' && step === 'otp' && (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="text-center">
                  <ShieldCheck className="w-12 h-12 text-primary mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">קוד אימות נשלח ב-SMS</p>
                  <p className="text-muted-foreground/70 text-xs mt-1" dir="ltr">{normalizedPhone}</p>
                  {isDevDemoOtpEnabled && devOtp && (
                    <div className="glass-gold rounded-2xl p-4 mt-3">
                      <p className="text-xs text-muted-foreground">קוד פיתוח מקומי</p>
                      <p className="text-4xl font-black gold-text tracking-widest">{devOtp}</p>
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="הזן קוד 6 ספרות"
                  className="w-full bg-secondary border border-border rounded-2xl px-4 py-4 text-foreground text-center text-2xl font-bold tracking-widest placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                  maxLength={6}
                />
                {error && <p className="text-destructive text-sm text-center">{error}</p>}
                <GoldButton onClick={handleVerifyOTP} size="lg" className="w-full" disabled={loading}>
                  {loading ? 'מאמת...' : 'אמת קוד'}
                </GoldButton>
                <button
                  onClick={() => {
                    resetFirebasePhoneRecaptcha();
                    confirmationResultRef.current = null;
                    setStep('phone');
                  }}
                  className="flex items-center gap-1 text-muted-foreground text-sm mx-auto"
                >
                  <ArrowRight className="w-4 h-4" /> חזרה
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
