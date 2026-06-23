import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Store, Phone, MapPin, Navigation2, MessageCircle, Instagram, Sparkles } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { BUSINESS_INFO, BARBER_PHOTO } from '../../lib/businessConfig';
import {
  DEFAULT_BOOKING_POLICY_TEXT,
  DEFAULT_BOOKING_POLICY_VERSION,
  saveBookingSettings,
  saveBusinessSettings,
} from '@/lib/businessFirestore';
import { useBookingSettingsRealtime, useBusinessSettingsRealtime } from '@/hooks/useBookingData';
import { toast } from '@/components/ui/use-toast';
import GoldButton from '../../components/ui/GoldButton';
import { getUserFacingErrorMessage } from '@/lib/userFacingErrors';

export default function AdminSettings() {
  const navigate = useNavigate();
  const [info, setInfo] = useState(/** @type {Record<string, any>} */ ({ ...BUSINESS_INFO }));
  const { settings: bookingSettings } = useBookingSettingsRealtime();
  const { settings: businessSettings } = useBusinessSettingsRealtime();
  const [bufferMinutes, setBufferMinutes] = useState(null);
  const [visibleSlotIntervalMinutes, setVisibleSlotIntervalMinutes] = useState(null);
  const [cancellationDeadlineMinutes, setCancellationDeadlineMinutes] = useState(null);
  const displayedBuffer = bufferMinutes
    ?? bookingSettings?.appointmentBufferMinutes
    ?? bookingSettings?.defaultAppointmentBufferAfterMinutes
    ?? bookingSettings?.defaultAppointmentBufferBeforeMinutes
    ?? 0;
  const displayedVisibleSlotInterval = visibleSlotIntervalMinutes
    ?? bookingSettings?.visibleSlotIntervalMinutes
    ?? 30;
  const displayedCancellationDeadline = cancellationDeadlineMinutes
    ?? businessSettings?.cancellationDeadlineMinutesBeforeAppointment
    ?? bookingSettings?.cancellationDeadlineMinutesBeforeAppointment
    ?? 180;

  useEffect(() => {
    if (businessSettings) setInfo(previous => ({ ...previous, ...businessSettings }));
  }, [businessSettings]);

  const saveSettings = useMutation({
    mutationFn: () => Promise.all([
      saveBookingSettings({
        appointmentBufferMinutes: displayedBuffer,
        defaultAppointmentBufferBeforeMinutes: 0,
        defaultAppointmentBufferAfterMinutes: displayedBuffer,
        visibleSlotIntervalMinutes: displayedVisibleSlotInterval,
        cancellationDeadlineMinutesBeforeAppointment: displayedCancellationDeadline,
      }),
      saveBusinessSettings({
        ...info,
        defaultAppointmentBufferBeforeMinutes: 0,
        defaultAppointmentBufferAfterMinutes: displayedBuffer,
        visibleSlotIntervalMinutes: displayedVisibleSlotInterval,
        cancellationDeadlineMinutesBeforeAppointment: displayedCancellationDeadline,
      }),
    ]),
    onSuccess: () => toast({ title: 'ההגדרות נשמרו', description: 'המידע העסקי והמרווח בין התורים עודכנו.' }),
    onError: (error) => toast({
      variant: 'destructive',
      title: 'שמירת ההגדרות נכשלה',
      description: getUserFacingErrorMessage(error),
    }),
  });

  const handleSave = () => saveSettings.mutate();

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky-top-safe z-30 glass border-b border-white/10 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/admin')} className="press-scale">
          <ArrowRight className="w-6 h-6" />
        </button>
        <h1 className="font-black text-lg">הגדרות עסק</h1>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Profile Image */}
        <div className="flex flex-col items-center glass rounded-2xl p-5">
          <img src={BARBER_PHOTO} alt="OST" className="w-24 h-24 rounded-2xl object-cover border-2 border-primary mb-3" />
          <button className="glass-gold px-4 py-2 rounded-xl text-primary text-sm font-bold">
            שנה תמונה
          </button>
        </div>

        {/* Business Details */}
        <div className="glass rounded-2xl p-4 space-y-3">
          <h3 className="font-bold flex items-center gap-2">
            <Store className="w-4 h-4 text-primary" /> פרטי העסק
          </h3>
          {[
            { key: 'name', label: 'שם העסק', icon: Store },
            { key: 'phone', label: 'טלפון', icon: Phone },
            { key: 'address', label: 'כתובת', icon: MapPin },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
              <input
                value={info[key] || ''}
                onChange={e => setInfo(prev => ({ ...prev, [key]: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-right text-sm focus:outline-none focus:border-primary"
                dir="rtl"
              />
            </div>
          ))}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">תיאור</label>
            <textarea
              value={info.description || ''}
              onChange={e => setInfo(prev => ({ ...prev, description: e.target.value }))}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-right text-sm focus:outline-none focus:border-primary resize-none h-24"
              dir="rtl"
            />
          </div>
        </div>

        {/* Social / Contact Links */}
        <div className="glass rounded-2xl p-4 space-y-3">
          <h3 className="font-bold flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-primary" /> קישורים ויצירת קשר
          </h3>
          <p className="text-xs text-muted-foreground">הקישורים מופיעים בדף הבית של האפליקציה.</p>
          {[
            { key: 'whatsapp', label: 'WhatsApp (מספר טלפון)', icon: MessageCircle, placeholder: '0501234567' },
            { key: 'waze', label: 'קישור Waze', icon: Navigation2, placeholder: 'https://waze.com/ul/...' },
            { key: 'instagram', label: 'קישור Instagram', icon: Instagram, placeholder: 'https://instagram.com/...' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
              <input
                value={info[key] || ''}
                onChange={e => setInfo(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                dir="ltr"
              />
            </div>
          ))}
        </div>

        {/* Welcome / Greeting Text */}
        <div className="glass rounded-2xl p-4 space-y-3">
          <h3 className="font-bold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> טקסט ברוכים הבאים
          </h3>
          <p className="text-xs text-muted-foreground">מוצג בדף הבית של הלקוח מעל הכפתורים. ריק = ברירת מחדל.</p>
          <textarea
            value={info.welcomeText || ''}
            onChange={e => setInfo(prev => ({ ...prev, welcomeText: e.target.value }))}
            placeholder="ברוך הבא! בחר שירות והזמן תור..."
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-right text-sm focus:outline-none focus:border-primary resize-none h-20"
            dir="rtl"
          />
        </div>

        <div className="glass rounded-2xl p-4 space-y-3">
          <h3 className="font-bold">מרווח בין תורים</h3>
          <p className="text-xs text-muted-foreground">המרווח מתווסף אחרי כל תור של אותו ספר ומשפיע מיד על הזמינות.</p>
          <div className="flex gap-2">
            {[0, 10, 15, 30, 60].map(value => (
              <button
                key={value}
                onClick={() => setBufferMinutes(value)}
                className={`flex-1 py-2 rounded-xl text-sm font-bold ${displayedBuffer === value ? 'gold-gradient text-black' : 'glass text-muted-foreground'}`}
              >
                {value}
              </button>
            ))}
          </div>
          <label className="block text-xs text-muted-foreground">
            ערך מותאם אישית בדקות
            <input
              type="number"
              min="0"
              value={displayedBuffer}
              onChange={e => setBufferMinutes(Math.max(0, Number(e.target.value)))}
              className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-center text-sm focus:outline-none focus:border-primary"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            הצגת שעות פנויות כל X דקות
            <input
              type="number"
              min="1"
              value={displayedVisibleSlotInterval}
              onChange={e => setVisibleSlotIntervalMinutes(Math.max(1, Number(e.target.value)))}
              className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-center text-sm focus:outline-none focus:border-primary"
            />
          </label>
        </div>

        <div className="glass rounded-2xl p-4 space-y-3">
          <h3 className="font-bold">מדיניות ביטול ואי הגעה</h3>
          <label className="block text-xs text-muted-foreground">
            מדיניות שמוצגת לפני אישור תור
            <textarea
              value={info.bookingPolicyText || DEFAULT_BOOKING_POLICY_TEXT}
              onChange={e => setInfo(prev => ({ ...prev, bookingPolicyText: e.target.value }))}
              className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-right text-sm focus:outline-none focus:border-primary resize-none h-36"
              dir="rtl"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-muted-foreground">
              גרסת מדיניות
              <input
                value={info.bookingPolicyVersion || DEFAULT_BOOKING_POLICY_VERSION}
                onChange={e => setInfo(prev => ({ ...prev, bookingPolicyVersion: e.target.value }))}
                className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-center text-sm focus:outline-none focus:border-primary"
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              זמן ביטול מותר לפני התור בדקות
              <input
                type="number"
                min="0"
                value={displayedCancellationDeadline}
                onChange={e => setCancellationDeadlineMinutes(Math.max(0, Number(e.target.value)))}
                className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-center text-sm focus:outline-none focus:border-primary"
              />
            </label>
          </div>
        </div>

        <GoldButton onClick={handleSave} disabled={saveSettings.isPending} size="lg" className="w-full">
          {saveSettings.isPending ? 'שומר...' : 'שמור שינויים'}
        </GoldButton>
      </div>
    </div>
  );
}
