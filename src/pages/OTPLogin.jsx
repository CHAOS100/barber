import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Phone, ShieldCheck, Lock, Mail, MessageCircle } from 'lucide-react';
import { loginUser } from '../lib/userStore';
import { BARBER_PHOTO } from '../lib/businessConfig';
import GoldButton from '../components/ui/GoldButton';
import {
  confirmFirebasePhoneCode,
  getErrorCode,
  getErrorMessage,
  getErrorNumber,
  getPhoneAuthErrorMessage,
  isCapacitorAndroidNative,
  normalizeIsraeliPhoneNumber,
  resetFirebasePhoneRecaptcha,
  serializeFirebaseError,
  signInFirebaseAdmin,
  signInFirebaseAdminWithPhoneCode,
  signInFirebaseAdminWithVerifiedPhoneUser,
  startFirebasePhoneVerification,
} from '@/lib/firebase';
import {
  completeExistingCustomerLogin,
  createCustomerProfile,
  customerProfileToSession,
  findAuthenticatedUserProfile,
} from '@/lib/customerProfilesFirestore';

const RESEND_COOLDOWN_SECONDS = 60;
const MAX_RESEND_ATTEMPTS = 2;
const WHATSAPP_NUMBER = '054-2244542';
const WHATSAPP_URL = 'https://wa.me/972542244542';
const INVALID_PHONE_MESSAGE = 'מספר הטלפון לא תקין';

/**
 * @typedef {{ name?: string, email?: string, phoneNumber?: string }} AdminProfile
 */

const phoneAuthPlatform = () => (isCapacitorAndroidNative() ? 'native' : 'web');

/**
 * @param {string} rawInput
 * @param {string} context
 * @returns {string}
 */
const normalizePhoneForOtp = (rawInput, context) => {
  try {
    const normalizedPhone = normalizeIsraeliPhoneNumber(rawInput);
    console.info('[Firebase Phone Auth] phone input validation', {
      context,
      inputLength: String(rawInput || '').length,
      validationResult: true,
      platform: phoneAuthPlatform(),
    });
    return normalizedPhone;
  } catch (error) {
    console.warn('[Firebase Phone Auth] phone input validation', {
      context,
      inputLength: String(rawInput || '').length,
      validationResult: false,
      platform: phoneAuthPlatform(),
      code: getErrorCode(error) === 'unknown' ? 'auth/invalid-phone-number' : getErrorCode(error),
    });
    throw error;
  }
};

/** @param {unknown} error */
const getPhoneLoginErrorMessage = (error) => (
  getErrorCode(error) === 'auth/invalid-phone-number'
    ? INVALID_PHONE_MESSAGE
    : getPhoneAuthErrorMessage(error)
);

/**
 * @param {import('firebase/auth').User} firebaseUser
 * @param {AdminProfile | null | undefined} profile
 */
const buildAdminSession = (firebaseUser, profile) => {
  if (!profile) {
    throw Object.assign(new Error('Admin profile is missing.'), {
      code: 'admin/profile-missing',
    });
  }

  return {
    name: profile.name || 'מנהל',
    email: profile.email || firebaseUser.email || '',
    phoneNumber: profile.phoneNumber || firebaseUser.phoneNumber || '',
    uid: firebaseUser.uid,
    isAdmin: true,
  };
};

export default function OTPLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const nextPath = location.state?.next || '/';

  // mode: 'customer' | 'admin'
  const [mode, setMode] = useState(location.state?.admin ? 'admin' : 'customer');

  // Customer OTP flow
  const [step, setStep] = useState('phone'); // phone | otp | registration
  const [phone, setPhone] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const confirmationResultRef = useRef(null);
  const isSendingOtpRef = useRef(false);
  const verificationInFlightRef = useRef(false);
  const cooldownUntilRef = useRef(0);
  const resendAttemptsRef = useRef(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendAttempts, setResendAttempts] = useState(0);

  // Admin login
  const [adminLoginMethod, setAdminLoginMethod] = useState('email');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminNormalizedPhone, setAdminNormalizedPhone] = useState('');
  const [adminPhoneOtp, setAdminPhoneOtp] = useState('');
  const [adminPhoneStep, setAdminPhoneStep] = useState('phone');
  const adminConfirmationResultRef = useRef(null);
  const adminSendingOtpRef = useRef(false);
  const adminVerificationInFlightRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [smsLoading, setSmsLoading] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (step !== 'otp' || resendCooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step, resendCooldown]);

  // ─── Customer OTP ──────────────────────────────────────────────
  /** @param {import('firebase/auth').User} firebaseUser */
  const completeCustomerFirebaseLogin = async (firebaseUser) => {
    console.info('[Customer Auth] OTP confirmed', { uid: firebaseUser.uid });

    const existingProfile = await findAuthenticatedUserProfile();
    if (!existingProfile) {
      setStep('registration');
      setError('');
      return;
    }

    const profile = await completeExistingCustomerLogin();
    if (!profile) {
      setStep('registration');
      setError('');
      return;
    }

    loginUser(customerProfileToSession(profile));
    navigate(nextPath);
  };

  /**
   * @param {boolean} [isResend]
   * @param {HTMLButtonElement | null} [triggerButton]
   */
  const handleSendOTP = async (isResend = false, triggerButton = null) => {
    if (isSendingOtpRef.current || smsLoading || verificationInFlightRef.current) return;
    if (!isResend && confirmationResultRef.current) {
      setStep('otp');
      return;
    }
    if (Date.now() < cooldownUntilRef.current || resendCooldown > 0) return;
    if (isResend && (resendAttemptsRef.current >= MAX_RESEND_ATTEMPTS || resendAttempts >= MAX_RESEND_ATTEMPTS)) return;

    if (triggerButton) triggerButton.disabled = true;
    isSendingOtpRef.current = true;
    setSmsLoading(true);
    setError('');

    try {
      const customerPhone = isResend && normalizedPhone
        ? normalizePhoneForOtp(normalizedPhone, 'customer-login-resend')
        : normalizePhoneForOtp(phone, 'customer-login');
      setNormalizedPhone(customerPhone);
      cooldownUntilRef.current = Date.now() + (RESEND_COOLDOWN_SECONDS * 1000);
      if (isResend) {
        resendAttemptsRef.current += 1;
        setResendAttempts(resendAttemptsRef.current);
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
      }

      console.info('[Firebase Phone Auth] starting customer SMS flow', {
        isResend,
        platform: phoneAuthPlatform(),
      });
      const result = await startFirebasePhoneVerification(customerPhone, { isResend });
      console.info('[Customer Auth] OTP sent', {
        phoneNumberPresent: Boolean(result.phoneNumber),
        reusedExistingConfirmation: result.reused === true,
        provider: result.provider || 'web',
        autoVerified: result.autoVerified === true,
      });

      if (result.firebaseUser) {
        await completeCustomerFirebaseLogin(result.firebaseUser);
        return;
      }

      confirmationResultRef.current = result.confirmationResult;

      setOtp('');
      setStep('otp');
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      if (!isResend) {
        resendAttemptsRef.current = 0;
        setResendAttempts(0);
      }
    } catch (phoneAuthError) {
      const serializedError = serializeFirebaseError(phoneAuthError, 'Unknown Firebase error');
      console.error('[Firebase] Customer SMS verification failed', serializedError);
      if (getErrorCode(phoneAuthError) === 'auth/sms-cooldown-active') {
        const remainingSeconds = Math.ceil(getErrorNumber(phoneAuthError, 'cooldownRemainingMs') / 1000);
        cooldownUntilRef.current = Date.now() + (remainingSeconds * 1000);
        setResendCooldown(remainingSeconds);
      }
      setError(getPhoneLoginErrorMessage(phoneAuthError));
    } finally {
      isSendingOtpRef.current = false;
      setSmsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (verificationInFlightRef.current || isSendingOtpRef.current) return;
    if (otp.length !== 6) { setError('יש להזין קוד אימות בן 6 ספרות'); return; }
    verificationInFlightRef.current = true;
    setVerificationLoading(true);
    setError('');

    try {
      const firebaseUser = await confirmFirebasePhoneCode(confirmationResultRef.current, otp);
      await completeCustomerFirebaseLogin(firebaseUser);
    } catch (phoneAuthError) {
      console.error(
        '[Firebase] Customer phone code verification failed',
        serializeFirebaseError(phoneAuthError, 'Unknown Firebase error'),
      );
      const code = getErrorCode(phoneAuthError);
      setError(
        code.startsWith('customer/') || code.startsWith('functions/')
          ? 'אימות המספר הצליח, אך טעינת פרופיל הלקוח נכשלה. יש לפנות למנהל המערכת.'
          : getPhoneAuthErrorMessage(phoneAuthError),
      );
    } finally {
      verificationInFlightRef.current = false;
      setVerificationLoading(false);
    }
  };

  const handleCompleteRegistration = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError('יש להזין שם פרטי ושם משפחה');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const profile = await createCustomerProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      loginUser(customerProfileToSession(profile));
      navigate(nextPath);
    } catch (registrationError) {
      console.error(
        '[Customer Auth] registration failed',
        serializeFirebaseError(registrationError, 'Unknown registration error'),
      );
      setError(
        getErrorCode(registrationError) === 'functions/already-exists'
          ? 'כבר קיים חשבון עבור מספר הטלפון הזה. יש לחזור ולהתחבר מחדש.'
          : 'יצירת החשבון נכשלה. יש לנסות שוב.',
      );
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
      loginUser(buildAdminSession(firebaseUser, profile));
      navigate('/admin');
    } catch (signInError) {
      console.error(
        '[Firebase] Admin sign-in failed',
        serializeFirebaseError(signInError, 'Unknown Firebase error'),
      );

      if (getErrorCode(signInError) === 'admin/not-authorized') {
        setError('אין לך הרשאת מנהל.');
      } else if (getErrorMessage(signInError, '').includes('Missing Vercel build-time environment variables')) {
        setError('אירעה תקלה זמנית. נסה שוב.');
      } else {
        setError('אירעה תקלה זמנית. נסה שוב.');
      }
    } finally {
      setLoading(false);
    }
  };

  /** @param {React.MouseEvent<HTMLButtonElement>} [event] */
  const handleAdminSendPhoneOTP = async (event) => {
    if (event?.currentTarget) event.currentTarget.disabled = true;
    if (
      adminSendingOtpRef.current
      || smsLoading
      || adminVerificationInFlightRef.current
      || adminConfirmationResultRef.current
    ) {
      if (adminConfirmationResultRef.current) setAdminPhoneStep('otp');
      return;
    }

    adminSendingOtpRef.current = true;
    setSmsLoading(true);
    setError('');
    try {
      const normalizedAdminPhone = normalizePhoneForOtp(adminPhone, 'admin-phone-login');
      setAdminNormalizedPhone(normalizedAdminPhone);
      console.info('[Firebase Phone Auth] starting admin SMS flow', {
        platform: phoneAuthPlatform(),
      });
      const result = await startFirebasePhoneVerification(normalizedAdminPhone);
      console.info('[Admin Auth] OTP sent', {
        phoneNumberPresent: Boolean(result.phoneNumber),
        reusedExistingConfirmation: result.reused === true,
        provider: result.provider || 'web',
        autoVerified: result.autoVerified === true,
      });

      if (result.firebaseUser) {
        const { user: firebaseUser, profile } = await signInFirebaseAdminWithVerifiedPhoneUser(
          result.firebaseUser,
        );
        loginUser(buildAdminSession(firebaseUser, profile));
        navigate('/admin');
        return;
      }

      adminConfirmationResultRef.current = result.confirmationResult;
      setAdminPhoneOtp('');
      setAdminPhoneStep('otp');
    } catch (phoneAuthError) {
      console.error(
        '[Firebase] Admin SMS verification failed',
        serializeFirebaseError(phoneAuthError, 'Unknown Firebase error'),
      );
      setError(getPhoneLoginErrorMessage(phoneAuthError));
    } finally {
      adminSendingOtpRef.current = false;
      setSmsLoading(false);
    }
  };

  const handleAdminVerifyPhoneOTP = async () => {
    if (adminVerificationInFlightRef.current || adminSendingOtpRef.current) return;
    if (adminPhoneOtp.length !== 6) {
      setError('יש להזין קוד אימות בן 6 ספרות');
      return;
    }

    adminVerificationInFlightRef.current = true;
    setVerificationLoading(true);
    setError('');
    try {
      const { user: firebaseUser, profile } = await signInFirebaseAdminWithPhoneCode(
        adminConfirmationResultRef.current,
        adminPhoneOtp,
      );
      loginUser(buildAdminSession(firebaseUser, profile));
      navigate('/admin');
    } catch (signInError) {
      console.error(
        '[Firebase] Admin phone sign-in failed',
        serializeFirebaseError(signInError, 'Unknown Firebase error'),
      );
      if (getErrorCode(signInError) === 'admin/not-authorized') {
        adminConfirmationResultRef.current = null;
        setAdminPhoneStep('phone');
      }
      setError(getErrorCode(signInError) === 'admin/not-authorized'
        ? 'אין לך הרשאת מנהל.'
        : getPhoneAuthErrorMessage(signInError));
    } finally {
      adminVerificationInFlightRef.current = false;
      setVerificationLoading(false);
    }
  };

  const switchToAdmin = () => {
    if (isSendingOtpRef.current || verificationInFlightRef.current) return;
    resetFirebasePhoneRecaptcha('switch-to-admin');
    setMode('admin');
    setError('');
  };
  const switchToCustomer = () => {
    setMode('customer');
    setError('');
    setStep('phone');
    setFirstName('');
    setLastName('');
    if (!confirmationResultRef.current) {
      setNormalizedPhone('');
      cooldownUntilRef.current = 0;
      resendAttemptsRef.current = 0;
      setResendAttempts(0);
      setResendCooldown(0);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col" dir="rtl">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          {/* Header */}
          <div className="text-center mb-6 sm:mb-10">
            <img src={BARBER_PHOTO} alt="OST Barber" className="w-24 h-24 rounded-2xl border-2 border-primary object-cover gold-shadow mx-auto mb-4" />
            <h1 className="text-3xl font-black tracking-tight">OST BARBER</h1>
            <p className="text-muted-foreground mt-1">
              {mode === 'admin' ? 'כניסת מנהל' : 'כניסה לחשבון'}
            </p>
          </div>

          <div className="auth-step-frame">
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

                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-secondary/60 p-1">
                  <button
                    type="button"
                    onClick={() => { setAdminLoginMethod('email'); setError(''); }}
                    className={`rounded-xl py-2 text-sm font-bold transition-colors ${adminLoginMethod === 'email' ? 'bg-primary text-black' : 'text-muted-foreground'}`}
                  >
                    אימייל
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAdminLoginMethod('phone'); setError(''); }}
                    className={`rounded-xl py-2 text-sm font-bold transition-colors ${adminLoginMethod === 'phone' ? 'bg-primary text-black' : 'text-muted-foreground'}`}
                  >
                    SMS
                  </button>
                </div>

                {adminLoginMethod === 'email' && (
                  <>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">אימייל</label>
                      <div className="relative">
                        <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <input
                          type="email"
                          value={adminEmail}
                          onChange={(/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => setAdminEmail(event.target.value)}
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
                          onChange={(/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => setAdminPassword(event.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-secondary border border-border rounded-2xl px-4 py-4 pr-12 text-foreground text-right placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                          onKeyDown={(/** @type {React.KeyboardEvent<HTMLInputElement>} */ event) => event.key === 'Enter' && handleAdminLogin()}
                        />
                      </div>
                    </div>

                    {error && <p className="text-destructive text-sm text-center">{error}</p>}

                    <GoldButton onClick={handleAdminLogin} size="lg" className="w-full" disabled={loading}>
                      {loading ? 'מתחבר...' : 'כניסה למערכת ניהול'}
                    </GoldButton>
                  </>
                )}

                {adminLoginMethod === 'phone' && (
                  <>
                    {adminPhoneStep === 'phone' ? (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground mb-2 block">טלפון מנהל</label>
                        <div className="relative">
                          <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <input
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            value={adminPhone}
                            disabled={Boolean(adminConfirmationResultRef.current)}
                            onChange={(/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => {
                              setAdminPhone(event.target.value);
                              setAdminNormalizedPhone('');
                            }}
                            placeholder="050 000 0000"
                            className="w-full bg-secondary border border-border rounded-2xl px-4 py-4 pr-12 text-foreground text-left placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                            dir="ltr"
                            style={{ textAlign: 'left' }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-center">
                          <ShieldCheck className="w-12 h-12 text-primary mx-auto mb-2" />
                          <p className="text-muted-foreground text-sm">קוד אימות נשלח ב-SMS</p>
                          <p className="text-muted-foreground/70 text-xs mt-1" dir="ltr">{adminNormalizedPhone}</p>
                        </div>
                        <input
                          type="text"
                          autoComplete="one-time-code"
                          inputMode="numeric"
                          name="admin-one-time-code"
                          value={adminPhoneOtp}
                          onChange={(/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => setAdminPhoneOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                          onPaste={(/** @type {React.ClipboardEvent<HTMLInputElement>} */ event) => {
                            const pastedCode = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                            if (!pastedCode) return;
                            event.preventDefault();
                            setAdminPhoneOtp(pastedCode);
                          }}
                          placeholder="הזן קוד 6 ספרות"
                          className="w-full bg-secondary border border-border rounded-2xl px-4 py-4 text-foreground text-center text-2xl font-bold tracking-widest placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                          maxLength={6}
                        />
                      </div>
                    )}

                    {error && <p className="text-destructive text-sm text-center">{error}</p>}

                    {adminPhoneStep === 'phone' ? (
                      <GoldButton
                        onClick={handleAdminSendPhoneOTP}
                        size="lg"
                        className="w-full"
                        disabled={smsLoading || verificationLoading || Boolean(adminConfirmationResultRef.current)}
                      >
                        {smsLoading ? 'שולח...' : 'שלח קוד מנהל'}
                      </GoldButton>
                    ) : (
                      <GoldButton
                        onClick={handleAdminVerifyPhoneOTP}
                        size="lg"
                        className="w-full"
                        disabled={verificationLoading || smsLoading}
                      >
                        {verificationLoading ? 'מאמת...' : 'כניסה לניהול'}
                      </GoldButton>
                    )}

                    {adminPhoneStep === 'otp' && (
                      <button
                        type="button"
                        disabled={smsLoading || verificationLoading}
                        onClick={() => setAdminPhoneStep('phone')}
                        className="flex items-center gap-1 text-muted-foreground text-sm mx-auto"
                      >
                        <ArrowRight className="w-4 h-4" /> חזרה לטלפון
                      </button>
                    )}
                  </>
                )}

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
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">מספר טלפון</label>
                  <div className="relative">
                    <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      disabled={Boolean(confirmationResultRef.current)}
                      onChange={(/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => {
                        setPhone(event.target.value);
                        setNormalizedPhone('');
                      }}
                      placeholder="050 000 0000"
                      className="w-full bg-secondary border border-border rounded-2xl px-4 py-4 pr-12 text-foreground text-left placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                      dir="ltr"
                      style={{ textAlign: 'left' }}
                    />
                  </div>
                  <p className="text-muted-foreground text-xs mt-1.5 text-right">
                    הזן מספר טלפון ישראלי לקבלת קוד אימות
                  </p>
                </div>
                {error && <p className="text-destructive text-sm text-center">{error}</p>}
                <GoldButton
                  onClick={(/** @type {React.MouseEvent<HTMLButtonElement>} */ event) => handleSendOTP(false, event.currentTarget)}
                  size="lg"
                  className="w-full"
                  disabled={smsLoading || verificationLoading}
                >
                  {smsLoading
                    ? 'שולח...'
                    : confirmationResultRef.current
                      ? 'חזרה להזנת הקוד'
                      : 'שלח קוד אימות'}
                </GoldButton>

                {/* Admin link */}
                <div className="text-center pt-2">
                  <button
                    onClick={switchToAdmin}
                    disabled={smsLoading || verificationLoading}
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
                </div>
                <input
                  type="text"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  name="one-time-code"
                  value={otp}
                  onChange={(/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  onPaste={(/** @type {React.ClipboardEvent<HTMLInputElement>} */ event) => {
                    const pastedCode = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                    if (!pastedCode) return;
                    event.preventDefault();
                    setOtp(pastedCode);
                  }}
                  placeholder="הזן קוד 6 ספרות"
                  className="w-full bg-secondary border border-border rounded-2xl px-4 py-4 text-foreground text-center text-2xl font-bold tracking-widest placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                  maxLength={6}
                />
                {error && <p className="text-destructive text-sm text-center">{error}</p>}
                <GoldButton onClick={handleVerifyOTP} size="lg" className="w-full" disabled={verificationLoading || smsLoading}>
                  {verificationLoading ? 'מאמת...' : 'אמת קוד'}
                </GoldButton>
                <div className="glass rounded-2xl p-4 text-center space-y-2">
                  <p className="text-sm font-bold">לא קיבלת קוד?</p>
                  {resendAttempts >= MAX_RESEND_ATTEMPTS ? (
                    <p className="text-muted-foreground text-xs leading-5">
                      ניסית לשלוח קוד מספר פעמים. אם הקוד לא הגיע, צור קשר עם הספר.
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={(/** @type {React.MouseEvent<HTMLButtonElement>} */ event) => handleSendOTP(true, event.currentTarget)}
                      disabled={smsLoading || verificationLoading || resendCooldown > 0}
                      className="text-primary text-sm font-bold disabled:text-muted-foreground disabled:cursor-not-allowed"
                    >
                      {smsLoading
                        ? 'שולח...'
                        : resendCooldown > 0
                          ? `שליחה מחדש בעוד ${resendCooldown} שניות`
                          : 'שליחה מחדש'}
                    </button>
                  )}
                  <a
                    href={WHATSAPP_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 text-primary text-sm font-bold"
                  >
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp {WHATSAPP_NUMBER}
                  </a>
                </div>
                <button
                  disabled={smsLoading || verificationLoading}
                  onClick={() => {
                    resetFirebasePhoneRecaptcha('otp-back');
                    setStep('phone');
                  }}
                  className="flex items-center gap-1 text-muted-foreground text-sm mx-auto"
                >
                  <ArrowRight className="w-4 h-4" /> חזרה
                </button>
              </motion.div>
            )}

            {/* ─── CUSTOMER: FIRST REGISTRATION ─── */}
            {mode === 'customer' && step === 'registration' && (
              <motion.div
                key="registration"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="text-center mb-2">
                  <ShieldCheck className="w-12 h-12 text-primary mx-auto mb-2" />
                  <h2 className="font-black text-lg">השלמת הרשמה</h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    זו הכניסה הראשונה שלך. הפרטים יישמרו לחשבון המאומת.
                  </p>
                  <p className="text-muted-foreground/70 text-xs mt-1" dir="ltr">{normalizedPhone}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">שם פרטי</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => setFirstName(event.target.value)}
                    autoComplete="given-name"
                    className="w-full bg-secondary border border-border rounded-2xl px-4 py-4 text-foreground text-right focus:outline-none focus:border-primary transition-colors"
                    dir="rtl"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">שם משפחה</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => setLastName(event.target.value)}
                    autoComplete="family-name"
                    className="w-full bg-secondary border border-border rounded-2xl px-4 py-4 text-foreground text-right focus:outline-none focus:border-primary transition-colors"
                    dir="rtl"
                  />
                </div>
                {error && <p className="text-destructive text-sm text-center">{error}</p>}
                <GoldButton onClick={handleCompleteRegistration} size="lg" className="w-full" disabled={loading}>
                  {loading ? 'יוצר חשבון...' : 'השלם הרשמה'}
                </GoldButton>
              </motion.div>
            )}

          </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
