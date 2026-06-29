import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { User, Bell, Globe, ChevronLeft, Check, Phone, BellOff, BellRing } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { updateOwnCustomerPreferences } from '@/lib/customerProfilesFirestore';
import {
  getPushPermissionStatus,
  initPushNotifications,
  PUSH_PERMISSION_EXPLANATION_HE,
  isNativePlatform,
} from '@/lib/pushNotifications';
import { loginUser } from '@/lib/userStore';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { toast } from '@/components/ui/use-toast';
import { getUserFacingErrorMessage } from '@/lib/userFacingErrors';

const LANGUAGES = [
  { key: 'he', label: 'עברית' },
  { key: 'en', label: 'English' },
  { key: 'ar', label: 'العربية' },
];

// Phase 1 notification preference keys — aligned with Phase 2 push sender
const NOTIFICATION_SETTINGS = [
  { key: 'appointmentApprovedEnabled', label: 'אישור תור', desc: 'כשתור מאושר על ידי הספר' },
  { key: 'appointmentCancelledEnabled', label: 'ביטול תור', desc: 'כשתור בוטל מכל סיבה' },
  { key: 'reminder24hEnabled', label: 'תזכורת 24 שעות', desc: 'יום לפני התור' },
  { key: 'reminder2hEnabled', label: 'תזכורת שעתיים', desc: 'שעתיים לפני התור' },
  { key: 'waitlistAlertsEnabled', label: 'מקום פנוי ברשימת המתנה', desc: 'כשמקום נפתח שמתאים לבקשה שלך' },
  { key: 'barberMessagesEnabled', label: 'הודעות מהספר', desc: 'עדכונים, מבצעים ומסרים ישירים' },
  { key: 'paymentWarningsEnabled', label: 'התראות תשלום', desc: 'דרישות תשלום ואזהרות' },
  { key: 'haircutReminderEnabled', label: 'תזכורת לחזור להסתפר', desc: 'תזכורת לקבוע תור חדש לאחר תספורת' },
];

const defaultNotifications = {
  notificationsEnabled: true,
  appointmentApprovedEnabled: true,
  appointmentCancelledEnabled: true,
  reminder24hEnabled: true,
  reminder2hEnabled: true,
  waitlistAlertsEnabled: false,
  barberMessagesEnabled: true,
  paymentWarningsEnabled: true,
  haircutReminderEnabled: true,
  haircutReminderIntervalDays: 21,
  // Legacy keys kept for backward compatibility
  booking_confirm: true,
  reminder_24h: true,
  reminder_2h: true,
  slot_available: false,
  promotions: false,
};

// ── Push permission status helpers ────────────────────────────────────────────

const PERMISSION_LABELS = {
  granted: { text: 'פעיל', color: 'text-green-400' },
  denied: { text: 'חסום', color: 'text-red-400' },
  prompt: { text: 'לא הוגדר', color: 'text-yellow-400' },
  web: { text: 'לא זמין במכשיר זה', color: 'text-muted-foreground' },
};

// ── SettingsTab component ─────────────────────────────────────────────────────

export default function SettingsTab({ currentUser, openPersonalRequest = 0 }) {
  const { currentUser: liveUser } = useCurrentUser();
  const user = liveUser || currentUser;

  const [section, setSection] = useState(null);
  const [notifs, setNotifs] = useState({
    ...defaultNotifications,
    ...(user?.notificationPreferences || {}),
  });
  const [lang, setLang] = useState(user?.language || 'he');
  const [pushStatus, setPushStatus] = useState(null); // 'granted' | 'denied' | 'prompt' | 'web'
  const [pushRequesting, setPushRequesting] = useState(false);

  useEffect(() => {
    if (openPersonalRequest > 0) setSection('personal');
  }, [openPersonalRequest]);

  useEffect(() => {
    if (section === 'notifications') {
      getPushPermissionStatus().then(setPushStatus).catch(() => setPushStatus('web'));
    }
  }, [section]);

  const savePreferences = useMutation({
    mutationFn: updateOwnCustomerPreferences,
    onSuccess: (_, changes) => {
      loginUser({
        ...user,
        ...(changes.notificationPreferences
          ? { notificationPreferences: changes.notificationPreferences }
          : {}),
        ...(changes.language ? { language: changes.language } : {}),
      });
      toast({ title: 'ההעדפות נשמרו' });
    },
    onError: (error) => toast({
      variant: 'destructive',
      title: 'שמירת ההעדפות נכשלה',
      description: getUserFacingErrorMessage(error),
    }),
  });

  const toggleNotif = useCallback((key) => {
    const updated = { ...notifs, [key]: !notifs[key] };
    setNotifs(updated);
    savePreferences.mutate({ notificationPreferences: updated });
  }, [notifs, savePreferences]);

  const toggleAllNotifs = useCallback((enabled) => {
    const updated = { ...notifs, notificationsEnabled: enabled };
    setNotifs(updated);
    savePreferences.mutate({ notificationPreferences: updated });
  }, [notifs, savePreferences]);

  const setHaircutInterval = useCallback((days) => {
    const updated = { ...notifs, haircutReminderIntervalDays: days };
    setNotifs(updated);
    savePreferences.mutate({ notificationPreferences: updated });
  }, [notifs, savePreferences]);

  const changeLanguage = (key) => {
    setLang(key);
    savePreferences.mutate({ language: key });
  };

  const handleRequestPush = async () => {
    if (!isNativePlatform()) return;
    setPushRequesting(true);
    try {
      const uid = user?.uid || user?.id;
      const result = await initPushNotifications(uid);
      if (result.granted) {
        setPushStatus('granted');
        toast({ title: 'התראות הופעלו', description: 'תקבל/י תזכורות ועדכונים מהספר.' });
      } else if (result.reason === 'permission-denied') {
        setPushStatus('denied');
        toast({
          variant: 'destructive',
          title: 'התראות חסומות',
          description: 'יש להפעיל התראות בהגדרות המכשיר > אפליקציות > OST BARBER.',
        });
      }
    } catch {
      toast({ variant: 'destructive', title: 'שגיאה בהפעלת התראות' });
    } finally {
      setPushRequesting(false);
    }
  };

  // ── Section: Personal ──

  if (section === 'personal') {
    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
        <button onClick={() => setSection(null)} className="flex items-center gap-2 text-muted-foreground text-sm mb-5 press-scale">
          <ChevronLeft className="w-4 h-4 rotate-180" /> חזרה
        </button>
        <h3 className="font-black text-lg mb-2">פרטים אישיים</h3>
        <p className="text-muted-foreground text-xs mb-4">
          שמות ומספר טלפון הם פרטי זהות מאומתים. שינוי שם מתבצע דרך מנהל העסק בלבד.
        </p>
        <div className="space-y-3">
          <div className="glass rounded-2xl px-4 py-3 flex items-center gap-3">
            <User className="w-4 h-4 text-primary" />
            <div>
              <div className="text-xs text-muted-foreground">שם מלא</div>
              <div className="font-bold">{user?.name}</div>
            </div>
          </div>
          <div className="glass rounded-2xl px-4 py-3 flex items-center gap-3">
            <Phone className="w-4 h-4 text-primary" />
            <div>
              <div className="text-xs text-muted-foreground">מספר טלפון</div>
              <div className="font-bold" dir="ltr">{user?.phoneNumber || user?.phone}</div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Section: Notifications ──

  if (section === 'notifications') {
    const allEnabled = notifs.notificationsEnabled !== false;

    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
        <button onClick={() => setSection(null)} className="flex items-center gap-2 text-muted-foreground text-sm mb-5 press-scale">
          <ChevronLeft className="w-4 h-4 rotate-180" /> חזרה
        </button>
        <h3 className="font-black text-lg mb-1">הגדרות התראות</h3>
        <p className="text-muted-foreground text-xs mb-4">ההגדרות נשמרות לחשבון שלך בכל המכשירים</p>

        {/* Push permission status + request button */}
        {isNativePlatform() && (
          <div className="glass rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BellRing className="w-4 h-4 text-primary" />
                <div>
                  <div className="font-bold text-sm">התראות מהמכשיר</div>
                  {pushStatus && (
                    <div className={`text-xs mt-0.5 ${PERMISSION_LABELS[pushStatus]?.color}`}>
                      {PERMISSION_LABELS[pushStatus]?.text}
                    </div>
                  )}
                </div>
              </div>
              {pushStatus !== 'granted' && pushStatus !== 'denied' && (
                <button
                  onClick={handleRequestPush}
                  disabled={pushRequesting}
                  className="glass-gold rounded-xl px-3 py-1.5 text-primary text-xs font-bold press-scale disabled:opacity-50"
                >
                  {pushRequesting ? 'מפעיל...' : 'הפעל'}
                </button>
              )}
              {pushStatus === 'denied' && (
                <span className="text-xs text-red-400 font-medium">הגדרות מכשיר</span>
              )}
            </div>
            {pushStatus !== 'granted' && pushStatus !== 'denied' && (
              <p className="text-muted-foreground text-xs mt-2 leading-relaxed">
                {PUSH_PERMISSION_EXPLANATION_HE}
              </p>
            )}
          </div>
        )}

        {/* Master toggle */}
        <button
          onClick={() => toggleAllNotifs(!allEnabled)}
          className={`w-full rounded-2xl p-4 mb-3 flex items-center gap-3 press-scale border ${
            allEnabled
              ? 'bg-primary/10 border-primary/30'
              : 'dark-card border-transparent'
          }`}
        >
          {allEnabled
            ? <BellRing className="w-5 h-5 text-primary flex-shrink-0" />
            : <BellOff className="w-5 h-5 text-muted-foreground flex-shrink-0" />}
          <div className="flex-1 text-right">
            <div className="font-bold text-sm">קבלת התראות</div>
            <div className="text-muted-foreground text-xs mt-0.5">
              {allEnabled ? 'התראות פעילות' : 'כל ההתראות מושתקות'}
            </div>
          </div>
          <div className={`w-12 h-6 rounded-full transition-all duration-200 flex items-center px-0.5 ${allEnabled ? 'gold-gradient' : 'bg-secondary'}`}>
            <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${allEnabled ? 'translate-x-0' : 'translate-x-6'}`} />
          </div>
        </button>

        {/* Individual toggles */}
        <div className={`space-y-2 transition-opacity duration-200 ${allEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          {NOTIFICATION_SETTINGS.map(({ key, label, desc }) => (
            <button
              key={key}
              onClick={() => toggleNotif(key)}
              className="w-full dark-card rounded-2xl p-4 flex items-center gap-3 press-scale"
            >
              <div className="flex-1 text-right">
                <div className="font-bold text-sm">{label}</div>
                <div className="text-muted-foreground text-xs mt-0.5">{desc}</div>
              </div>
              <div className={`w-12 h-6 rounded-full transition-all duration-200 flex items-center px-0.5 ${notifs[key] ? 'gold-gradient' : 'bg-secondary'}`}>
                <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${notifs[key] ? 'translate-x-0' : 'translate-x-6'}`} />
              </div>
            </button>
          ))}

          {/* Haircut reminder frequency selector — shown only when the reminder is enabled */}
          {notifs.haircutReminderEnabled && (
            <div className="glass rounded-2xl px-4 py-3">
              <div className="text-xs text-muted-foreground mb-2.5 font-medium">תדירות התזכורת</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { days: 14, label: 'כל שבועיים' },
                  { days: 21, label: 'כל 3 שבועות' },
                  { days: 30, label: 'כל חודש' },
                  { days: 42, label: 'כל 6 שבועות' },
                ].map(({ days, label }) => (
                  <button
                    key={days}
                    onClick={() => setHaircutInterval(days)}
                    className={`rounded-xl py-2 px-3 text-xs font-bold press-scale transition-colors ${
                      (notifs.haircutReminderIntervalDays || 21) === days
                        ? 'gold-gradient text-black'
                        : 'glass text-muted-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  // ── Section: Language ──

  if (section === 'language') {
    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
        <button onClick={() => setSection(null)} className="flex items-center gap-2 text-muted-foreground text-sm mb-5 press-scale">
          <ChevronLeft className="w-4 h-4 rotate-180" /> חזרה
        </button>
        <h3 className="font-black text-lg mb-4">שפת הממשק</h3>
        <div className="space-y-2">
          {LANGUAGES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => changeLanguage(key)}
              className={`w-full dark-card rounded-2xl p-4 flex items-center gap-3 border ${lang === key ? 'border-primary bg-primary/5' : 'border-transparent'}`}
            >
              <span className="flex-1 text-right font-bold text-sm">{label}</span>
              {lang === key && <Check className="w-5 h-5 text-primary" />}
            </button>
          ))}
        </div>
      </motion.div>
    );
  }

  // ── Main section list ──

  const activeNotifsCount = Object.entries(notifs)
    .filter(([k, v]) => k !== 'notificationsEnabled' && !['booking_confirm', 'reminder_24h', 'reminder_2h', 'slot_available', 'promotions'].includes(k) && v === true)
    .length;

  const items = [
    { key: 'personal', icon: User, label: 'פרטים אישיים', desc: user?.name || '' },
    { key: 'notifications', icon: Bell, label: 'התראות', desc: notifs.notificationsEnabled === false ? 'מושתק' : `${activeNotifsCount} פעילות` },
    { key: 'language', icon: Globe, label: 'שפה', desc: LANGUAGES.find((item) => item.key === lang)?.label },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <h3 className="font-black text-base mb-4 text-muted-foreground">הגדרות חשבון</h3>
      <div className="space-y-2">
        {items.map(({ key, icon: Icon, label, desc }) => (
          <motion.button
            key={key}
            whileTap={{ scale: 0.98 }}
            onClick={() => setSection(key)}
            className="w-full dark-card rounded-2xl p-4 flex items-center gap-3 press-scale"
          >
            <div className="w-10 h-10 glass-gold rounded-xl flex items-center justify-center">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 text-right">
              <div className="font-bold text-sm">{label}</div>
              <div className="text-muted-foreground text-xs">{desc}</div>
            </div>
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
