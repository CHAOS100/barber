import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { User, Bell, Globe, ChevronLeft, Check, Phone, Mail, Save } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { localDb } from '@/lib/localData';
import { loginUser } from '../../lib/userStore';

const LANGUAGES = [
  { key: 'he', label: 'עברית', flag: '🇮🇱' },
  { key: 'en', label: 'English', flag: '🇺🇸' },
  { key: 'ar', label: 'العربية', flag: '🇸🇦' },
];

const NOTIFICATION_SETTINGS = [
  { key: 'booking_confirm', label: 'אישור תור', desc: 'כשתור נקבע או מאושר' },
  { key: 'reminder_24h', label: 'תזכורת 24 שעות', desc: 'יום לפני התור' },
  { key: 'reminder_2h', label: 'תזכורת 2 שעות', desc: 'שעתיים לפני התור' },
  { key: 'slot_available', label: 'מקום פנוי', desc: 'כשמקום נפתח ברשימת המתנה' },
  { key: 'promotions', label: 'מבצעים ועדכונים', desc: 'הצעות מיוחדות וחדשות' },
];

export default function SettingsTab({ currentUser, openPersonalRequest = 0 }) {
  const queryClient = useQueryClient();
  const [section, setSection] = useState(null);

  // Personal info
  const [name, setName] = useState(currentUser?.name || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (openPersonalRequest > 0) setSection('personal');
  }, [openPersonalRequest]);

  useEffect(() => {
    setName(currentUser?.name || '');
    setPhone(currentUser?.phone || '');
    setEmail(currentUser?.email || '');
  }, [currentUser?.email, currentUser?.name, currentUser?.phone]);

  // Notifications (fetched from CustomerProfile if exists)
  const { data: profile } = useQuery({
    queryKey: ['customer-profile', currentUser?.phone],
    queryFn: () => localDb.CustomerProfile.filter({ phone: currentUser.phone }),
    enabled: !!currentUser?.phone,
    select: d => d?.[0],
  });

  const [notifs, setNotifs] = useState({
    booking_confirm: true,
    reminder_24h: true,
    reminder_2h: true,
    slot_available: false,
    promotions: false,
  });

  const [lang, setLang] = useState('he');

  // Save personal info mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim();
      const trimmedPhone = phone.trim();
      const trimmedEmail = email.trim();

      if (!trimmedName) throw new Error('יש להזין שם מלא');

      if (profile?.id) {
        await localDb.CustomerProfile.update(profile.id, {
          name: trimmedName,
          phone: trimmedPhone,
          email: trimmedEmail,
        });
      } else if (trimmedPhone) {
        await localDb.CustomerProfile.create({
          name: trimmedName,
          phone: trimmedPhone,
          email: trimmedEmail,
        });
      }

      loginUser({
        ...currentUser,
        name: trimmedName,
        phone: trimmedPhone,
        email: trimmedEmail,
      });
    },
    onSuccess: () => {
      setSaveError('');
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ['customer-profile'] });
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (error) => {
      setSaved(false);
      setSaveError(error?.message || 'לא הצלחנו לשמור את פרטי החשבון');
    },
  });

  // Save notification prefs — stored in CustomerProfile notes as JSON
  const saveNotifsMutation = useMutation({
    mutationFn: async (/** @type {any} */ newNotifs) => {
      const notifStr = JSON.stringify(newNotifs);
      if (profile?.id) {
        await localDb.CustomerProfile.update(profile.id, { notes: notifStr });
      }
    },
  });

  const toggleNotif = (key) => {
    const updated = { ...notifs, [key]: !notifs[key] };
    setNotifs(updated);
    saveNotifsMutation.mutate(updated);
  };

  if (section === 'personal') {
    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
        <button onClick={() => setSection(null)} className="flex items-center gap-2 text-muted-foreground text-sm mb-5 press-scale">
          <ChevronLeft className="w-4 h-4 rotate-180" /> חזרה
        </button>
        <h3 className="font-black text-lg mb-4">פרטים אישיים</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">שם מלא</label>
            <div className="relative">
              <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-secondary border border-border rounded-2xl px-4 py-3 pr-10 text-foreground text-right placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                placeholder="שם מלא"
                dir="rtl"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">מספר טלפון</label>
            <div className="relative">
              <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full bg-secondary border border-border rounded-2xl px-4 py-3 pr-10 text-foreground text-right placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                placeholder="054-0000000"
                dir="ltr"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">אימייל</label>
            <div className="relative">
              <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-secondary border border-border rounded-2xl px-4 py-3 pr-10 text-foreground text-right placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                placeholder="email@example.com"
                dir="ltr"
              />
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              saved ? 'bg-green-500/20 text-green-400 border border-green-500/40' : 'gold-gradient text-black'
            }`}
          >
            {saveMutation.isPending ? 'שומר...' : saved ? '✓ נשמר בהצלחה' : (
              <><Save className="w-4 h-4" /> שמור שינויים</>
            )}
          </motion.button>
          {saveError && (
            <p className="text-red-400 text-xs text-center">{saveError}</p>
          )}
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
        <p className="text-muted-foreground text-xs mb-4">שינויים נשמרים אוטומטית</p>
        <div className="space-y-2">
          {NOTIFICATION_SETTINGS.map(({ key, label, desc }) => (
            <div
              key={key}
              onClick={() => toggleNotif(key)}
              className="dark-card rounded-2xl p-4 flex items-center gap-3 cursor-pointer press-scale"
            >
              <div className="flex-1 text-right">
                <div className="font-bold text-sm">{label}</div>
                <div className="text-muted-foreground text-xs mt-0.5">{desc}</div>
              </div>
              <div className={`w-12 h-6 rounded-full transition-all duration-200 flex items-center px-0.5 flex-shrink-0 ${
                notifs[key] ? 'gold-gradient' : 'bg-secondary'
              }`}>
                <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                  notifs[key] ? 'translate-x-0' : 'translate-x-6'
                }`} />
              </div>
            </div>
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
          {LANGUAGES.map(({ key, label, flag }) => (
            <motion.div
              key={key}
              whileTap={{ scale: 0.97 }}
              onClick={() => setLang(key)}
              className={`dark-card rounded-2xl p-4 flex items-center gap-3 cursor-pointer border transition-all ${
                lang === key ? 'border-primary bg-primary/5' : 'border-transparent'
              }`}
            >
              <span className="text-2xl">{flag}</span>
              <span className="flex-1 font-bold text-sm">{label}</span>
              {lang === key && <Check className="w-5 h-5 text-primary" />}
            </motion.div>
          ))}
        </div>
        <p className="text-muted-foreground text-xs text-center mt-4">* תמיכה בשפות נוספות בקרוב</p>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <h3 className="font-black text-base mb-4 text-muted-foreground">הגדרות חשבון</h3>
      <div className="space-y-2">
        {[
          { key: 'personal', icon: User, label: 'פרטים אישיים', desc: name || currentUser?.name || '' },
          { key: 'notifications', icon: Bell, label: 'התראות', desc: `${Object.values(notifs).filter(Boolean).length} מתוך ${NOTIFICATION_SETTINGS.length} פעילות` },
          { key: 'language', icon: Globe, label: 'שפה', desc: LANGUAGES.find(l => l.key === lang)?.label },
        ].map(({ key, icon: Icon, label, desc }) => (
          <motion.button
            key={key}
            whileTap={{ scale: 0.98 }}
            onClick={() => setSection(key)}
            className="w-full dark-card rounded-2xl p-4 flex items-center gap-3 press-scale"
          >
            <div className="w-10 h-10 glass-gold rounded-xl flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 text-right">
              <div className="font-bold text-sm">{label}</div>
              <div className="text-muted-foreground text-xs">{desc}</div>
            </div>
            <ChevronLeft className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
