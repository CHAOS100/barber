import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { User, Bell, Globe, ChevronLeft, Check, Phone } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { updateOwnCustomerPreferences } from '@/lib/customerProfilesFirestore';
import { loginUser } from '@/lib/userStore';
import { toast } from '@/components/ui/use-toast';

const LANGUAGES = [
  { key: 'he', label: 'עברית' },
  { key: 'en', label: 'English' },
  { key: 'ar', label: 'العربية' },
];

const NOTIFICATION_SETTINGS = [
  { key: 'booking_confirm', label: 'אישור תור', desc: 'כשתור נקבע או מאושר' },
  { key: 'reminder_24h', label: 'תזכורת 24 שעות', desc: 'יום לפני התור' },
  { key: 'reminder_2h', label: 'תזכורת 2 שעות', desc: 'שעתיים לפני התור' },
  { key: 'slot_available', label: 'מקום פנוי', desc: 'כשמקום נפתח ברשימת ההמתנה' },
  { key: 'promotions', label: 'מבצעים ועדכונים', desc: 'הצעות מיוחדות וחדשות' },
];

const defaultNotifications = {
  booking_confirm: true,
  reminder_24h: true,
  reminder_2h: true,
  slot_available: false,
  promotions: false,
};

export default function SettingsTab({ currentUser, openPersonalRequest = 0 }) {
  const [section, setSection] = useState(null);
  const [notifs, setNotifs] = useState({
    ...defaultNotifications,
    ...(currentUser?.notificationPreferences || {}),
  });
  const [lang, setLang] = useState(currentUser?.language || 'he');

  useEffect(() => {
    if (openPersonalRequest > 0) setSection('personal');
  }, [openPersonalRequest]);

  const savePreferences = useMutation({
    mutationFn: updateOwnCustomerPreferences,
    onSuccess: (_, changes) => {
      loginUser({
        ...currentUser,
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
      description: error?.message || 'יש לנסות שוב.',
    }),
  });

  const toggleNotif = (key) => {
    const updated = { ...notifs, [key]: !notifs[key] };
    setNotifs(updated);
    savePreferences.mutate({ notificationPreferences: updated });
  };

  const changeLanguage = (key) => {
    setLang(key);
    savePreferences.mutate({ language: key });
  };

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
              <div className="font-bold">{currentUser?.name}</div>
            </div>
          </div>
          <div className="glass rounded-2xl px-4 py-3 flex items-center gap-3">
            <Phone className="w-4 h-4 text-primary" />
            <div>
              <div className="text-xs text-muted-foreground">מספר טלפון</div>
              <div className="font-bold" dir="ltr">{currentUser?.phoneNumber || currentUser?.phone}</div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  if (section === 'notifications') {
    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
        <button onClick={() => setSection(null)} className="flex items-center gap-2 text-muted-foreground text-sm mb-5 press-scale">
          <ChevronLeft className="w-4 h-4 rotate-180" /> חזרה
        </button>
        <h3 className="font-black text-lg mb-1">הגדרות התראות</h3>
        <p className="text-muted-foreground text-xs mb-4">השינויים נשמרים ב-Firestore</p>
        <div className="space-y-2">
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
        </div>
      </motion.div>
    );
  }

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

  const items = [
    { key: 'personal', icon: User, label: 'פרטים אישיים', desc: currentUser?.name || '' },
    { key: 'notifications', icon: Bell, label: 'התראות', desc: `${Object.values(notifs).filter(Boolean).length} פעילות` },
    { key: 'language', icon: Globe, label: 'שפה', desc: LANGUAGES.find(item => item.key === lang)?.label },
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
