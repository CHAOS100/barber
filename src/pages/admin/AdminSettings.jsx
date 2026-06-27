import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Bell, Edit3, MessageCircle, Plus, Sparkles, Store, Trash2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { BUSINESS_INFO } from '../../lib/businessConfig';
import {
  DEFAULT_BOOKING_POLICY_TEXT,
  DEFAULT_BOOKING_POLICY_VERSION,
  DEFAULT_FEATURES,
  saveBookingSettings,
  saveBusinessSettings,
  saveBusinessFeatures,
  uploadHeroImage,
  uploadProfileImage,
} from '@/lib/businessFirestore';
import { useBookingSettingsRealtime, useBusinessSettingsRealtime } from '@/hooks/useBookingData';
import { toast } from '@/components/ui/use-toast';
import GoldButton from '../../components/ui/GoldButton';
import { getUserFacingErrorMessage } from '@/lib/userFacingErrors';
import AdminImageUploadButton from '@/components/admin/AdminImageUploadButton';
import { getGalleryUploadErrorMessage, validateGalleryImageFile } from '@/lib/galleryFirestore';

export default function AdminSettings() {
  const navigate = useNavigate();
  const [info, setInfo] = useState(/** @type {Record<string, any>} */ ({ ...BUSINESS_INFO }));
  const { settings: bookingSettings } = useBookingSettingsRealtime();
  const { settings: businessSettings } = useBusinessSettingsRealtime();
  const [bufferMinutes, setBufferMinutes] = useState(null);
  const [visibleSlotIntervalMinutes, setVisibleSlotIntervalMinutes] = useState(null);
  const [cancellationDeadlineMinutes, setCancellationDeadlineMinutes] = useState(null);
  const [heroUploadProgress, setHeroUploadProgress] = useState(0);
  const [profileUploadProgress, setProfileUploadProgress] = useState(0);

  // Features state
  const [features, setFeatures] = useState(/** @type {null|Array<any>} */ (null));
  const [editingFeatureIdx, setEditingFeatureIdx] = useState(null);
  const [newFeature, setNewFeature] = useState(null);
  const featuresInitRef = useRef(false);

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
    if (businessSettings) {
      setInfo(previous => ({ ...previous, ...businessSettings }));
      if (!featuresInitRef.current) {
        featuresInitRef.current = true;
        setFeatures(
          businessSettings.features?.length
            ? [...businessSettings.features]
            : [...DEFAULT_FEATURES],
        );
      }
    }
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

  const saveFeaturesMutation = useMutation({
    mutationFn: () => saveBusinessFeatures(features ?? []),
    onSuccess: () => toast({ title: 'תכונות המספרה נשמרו' }),
    onError: (error) => toast({
      variant: 'destructive',
      title: 'שמירת התכונות נכשלה',
      description: getUserFacingErrorMessage(error),
    }),
  });

  const uploadHeroMutation = useMutation({
    mutationFn: (file) => {
      validateGalleryImageFile(file);
      setHeroUploadProgress(0);
      return uploadHeroImage(file, setHeroUploadProgress);
    },
    onSuccess: (url) => {
      setInfo(prev => ({ ...prev, homeHeroImageUrl: url }));
      toast({ title: 'תמונת מסך הבית עודכנה' });
    },
    onError: (error) => toast({
      variant: 'destructive',
      title: 'העלאת תמונת מסך הבית נכשלה',
      description: getGalleryUploadErrorMessage(error),
    }),
    onSettled: () => setHeroUploadProgress(0),
  });

  const uploadProfileMutation = useMutation({
    mutationFn: (file) => {
      validateGalleryImageFile(file);
      setProfileUploadProgress(0);
      return uploadProfileImage(file, setProfileUploadProgress);
    },
    onSuccess: (url) => {
      setInfo(prev => ({ ...prev, profileImageUrl: url }));
      toast({ title: 'תמונת הספר עודכנה' });
    },
    onError: (error) => toast({
      variant: 'destructive',
      title: 'העלאת תמונת הספר נכשלה',
      description: getGalleryUploadErrorMessage(error),
    }),
    onSettled: () => setProfileUploadProgress(0),
  });

  const moveFeature = (index, direction) => {
    setFeatures(prev => {
      const arr = [...prev];
      const target = index + direction;
      if (target < 0 || target >= arr.length) return arr;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return arr.map((f, i) => ({ ...f, order: i }));
    });
  };

  const toggleFeature = (index) => {
    setFeatures(prev => prev.map((f, i) => i === index ? { ...f, enabled: !f.enabled } : f));
  };

  const deleteFeature = (index) => {
    setFeatures(prev => prev.filter((_, i) => i !== index).map((f, i) => ({ ...f, order: i })));
    if (editingFeatureIdx === index) setEditingFeatureIdx(null);
    else if (editingFeatureIdx !== null && editingFeatureIdx > index) setEditingFeatureIdx(editingFeatureIdx - 1);
  };

  const updateFeatureField = (index, field, value) => {
    setFeatures(prev => prev.map((f, i) => i === index ? { ...f, [field]: value } : f));
  };

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
        {/* Business Details */}
        <div className="glass rounded-2xl p-4 space-y-3">
          <h3 className="font-bold flex items-center gap-2">
            <Store className="w-4 h-4 text-primary" /> פרטי העסק
          </h3>
          {[
            { key: 'name', label: 'שם העסק' },
            { key: 'phone', label: 'טלפון' },
            { key: 'address', label: 'כתובת' },
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

        <div className="glass rounded-2xl p-4 space-y-3">
          <h3 className="font-bold">תמונות עסק</h3>
          <p className="text-xs text-muted-foreground">
            התמונות נשמרות ב־Firebase Storage ומוצגות ללקוחות אחרי שההעלאה מסתיימת.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="dark-card rounded-2xl p-3 space-y-3">
              <div>
                <div className="text-sm font-black">תמונת מסך בית</div>
                <div className="text-xs text-muted-foreground">מוצגת בחלק העליון של דף הבית.</div>
              </div>
              {(info.homeHeroImageUrl || businessSettings?.homeHeroImageUrl) && (
                <img
                  src={info.homeHeroImageUrl || businessSettings?.homeHeroImageUrl}
                  alt="תמונת מסך בית"
                  className="h-28 w-full rounded-2xl object-cover border border-white/10"
                />
              )}
              <AdminImageUploadButton
                context="settings-hero-image"
                disabled={uploadHeroMutation.isPending}
                isUploading={uploadHeroMutation.isPending}
                loadingLabel={`מעלה תמונה... ${heroUploadProgress}%`}
                label="שנה תמונת מסך בית"
                onFileSelected={(file) => file && uploadHeroMutation.mutate(file)}
              />
            </div>

            <div className="dark-card rounded-2xl p-3 space-y-3">
              <div>
                <div className="text-sm font-black">תמונת ספר / עסק</div>
                <div className="text-xs text-muted-foreground">מוצגת בפרופיל העסק ובמקומות תדמיתיים.</div>
              </div>
              {(info.profileImageUrl || businessSettings?.profileImageUrl) && (
                <img
                  src={info.profileImageUrl || businessSettings?.profileImageUrl}
                  alt="תמונת ספר"
                  className="h-28 w-full rounded-2xl object-cover border border-white/10"
                />
              )}
              <AdminImageUploadButton
                context="settings-profile-image"
                disabled={uploadProfileMutation.isPending}
                isUploading={uploadProfileMutation.isPending}
                loadingLabel={`מעלה תמונה... ${profileUploadProgress}%`}
                label="שנה תמונת ספר"
                onFileSelected={(file) => file && uploadProfileMutation.mutate(file)}
              />
            </div>
          </div>
        </div>

        {/* Social / Contact Links */}
        <div className="glass rounded-2xl p-4 space-y-3">
          <h3 className="font-bold flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-primary" /> קישורים ויצירת קשר
          </h3>
          <p className="text-xs text-muted-foreground">הקישורים מופיעים בדף הבית של האפליקציה.</p>
          {[
            { key: 'whatsapp', label: 'WhatsApp (מספר טלפון)', placeholder: '0501234567' },
            { key: 'waze', label: 'קישור Waze', placeholder: 'https://waze.com/ul/...' },
            { key: 'instagram', label: 'קישור Instagram', placeholder: 'https://instagram.com/...' },
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

        {/* Features / Highlights */}
        <div className="glass rounded-2xl p-4 space-y-3">
          <h3 className="font-bold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> תכונות המספרה
          </h3>
          <p className="text-xs text-muted-foreground">כרטיסיות שמוצגות בדף הבית ללקוחות. ניתן לסדר, להפעיל/לכבות ולערוך.</p>

          <div className="space-y-2">
            {(features ?? []).map((feature, i) => (
              <div key={feature.id || i} className="dark-card rounded-2xl p-3">
                {editingFeatureIdx === i ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        value={feature.icon}
                        onChange={e => updateFeatureField(i, 'icon', e.target.value)}
                        className="w-14 bg-secondary border border-border rounded-xl px-2 py-2 text-center text-lg"
                        placeholder="✂️"
                        maxLength={4}
                      />
                      <input
                        value={feature.title}
                        onChange={e => updateFeatureField(i, 'title', e.target.value)}
                        className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-right focus:outline-none focus:border-primary"
                        dir="rtl"
                        placeholder="כותרת"
                      />
                    </div>
                    <input
                      value={feature.description}
                      onChange={e => updateFeatureField(i, 'description', e.target.value)}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-right focus:outline-none focus:border-primary"
                      dir="rtl"
                      placeholder="תיאור קצר"
                    />
                    <button
                      onClick={() => setEditingFeatureIdx(null)}
                      className="text-primary text-xs font-bold"
                    >
                      ✓ סיום עריכה
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xl flex-shrink-0 w-8 text-center">{feature.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className={`font-bold text-sm ${!feature.enabled ? 'text-muted-foreground' : ''}`}>
                        {feature.title || <span className="text-muted-foreground italic text-xs">ללא כותרת</span>}
                      </div>
                      <div className="text-muted-foreground text-xs truncate">{feature.description}</div>
                    </div>
                    {/* Order arrows */}
                    <div className="flex flex-col gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => moveFeature(i, -1)}
                        disabled={i === 0}
                        className="text-muted-foreground disabled:opacity-25 text-xs leading-none py-0.5 px-1"
                      >▲</button>
                      <button
                        onClick={() => moveFeature(i, 1)}
                        disabled={i === (features?.length ?? 0) - 1}
                        className="text-muted-foreground disabled:opacity-25 text-xs leading-none py-0.5 px-1"
                      >▼</button>
                    </div>
                    {/* Enable toggle */}
                    <button
                      onClick={() => toggleFeature(i)}
                      className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-all flex-shrink-0 ${feature.enabled ? 'gold-gradient' : 'bg-secondary border border-border'}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${feature.enabled ? 'translate-x-0' : 'translate-x-4'}`} />
                    </button>
                    {/* Edit */}
                    <button onClick={() => setEditingFeatureIdx(i)} className="glass p-1.5 rounded-lg flex-shrink-0">
                      <Edit3 className="w-3 h-3 text-primary" />
                    </button>
                    {/* Delete */}
                    <button onClick={() => deleteFeature(i)} className="glass p-1.5 rounded-lg flex-shrink-0">
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Add new feature form */}
            {newFeature !== null && (
              <div className="dark-card rounded-2xl p-3 space-y-2 border border-primary/30">
                <div className="flex gap-2">
                  <input
                    value={newFeature.icon}
                    onChange={e => setNewFeature(f => ({ ...f, icon: e.target.value }))}
                    className="w-14 bg-secondary border border-border rounded-xl px-2 py-2 text-center text-lg"
                    placeholder="✂️"
                    maxLength={4}
                  />
                  <input
                    value={newFeature.title}
                    onChange={e => setNewFeature(f => ({ ...f, title: e.target.value }))}
                    className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-right focus:outline-none focus:border-primary"
                    dir="rtl"
                    placeholder="כותרת"
                    autoFocus
                  />
                </div>
                <input
                  value={newFeature.description}
                  onChange={e => setNewFeature(f => ({ ...f, description: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-right focus:outline-none focus:border-primary"
                  dir="rtl"
                  placeholder="תיאור קצר"
                />
                <div className="flex gap-2">
                  <button onClick={() => setNewFeature(null)} className="flex-1 glass py-2 rounded-xl text-sm text-muted-foreground font-bold">
                    ביטול
                  </button>
                  <button
                    onClick={() => {
                      if (!newFeature.title.trim()) return;
                      setFeatures(prev => [
                        ...(prev ?? []),
                        { ...newFeature, id: `f_${Date.now()}`, order: (prev ?? []).length },
                      ]);
                      setNewFeature(null);
                    }}
                    className="flex-1 gold-gradient text-black py-2 rounded-xl text-sm font-bold"
                  >
                    הוסף
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {newFeature === null && (
              <button
                onClick={() => setNewFeature({ icon: '✂️', title: '', description: '', enabled: true })}
                className="flex-1 glass py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1 press-scale"
              >
                <Plus className="w-4 h-4" /> הוסף תכונה
              </button>
            )}
            <button
              onClick={() => saveFeaturesMutation.mutate()}
              disabled={saveFeaturesMutation.isPending || features === null}
              className="flex-1 gold-gradient text-black py-2.5 rounded-xl text-sm font-bold press-scale disabled:opacity-60"
            >
              {saveFeaturesMutation.isPending ? 'שומר...' : 'שמור תכונות'}
            </button>
          </div>
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

        {/* Push Notifications — Admin Global Control */}
        <div className="glass rounded-2xl p-4 space-y-3">
          <h3 className="font-bold flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" /> התראות Push אוטומטיות
          </h3>
          <p className="text-xs text-muted-foreground">
            כשמופעל, המערכת שולחת התראות Push ללקוחות על אישור תור, ביטול ותזכורות.
            כיבוי עוצר את יצירת משרות ההתראה עבור אירועים חדשים.
          </p>
          <button
            type="button"
            onClick={() => setInfo(prev => ({ ...prev, automaticPushRemindersEnabled: !(prev.automaticPushRemindersEnabled ?? true) }))}
            className="w-full dark-card rounded-2xl p-4 flex items-center gap-3 press-scale"
          >
            <div className="flex-1 text-right">
              <div className="font-bold text-sm">שליחת התראות אוטומטית</div>
              <div className="text-muted-foreground text-xs mt-0.5">
                {(info.automaticPushRemindersEnabled ?? true) ? 'פעיל — מרועים Push לאירועי תורים' : 'כבוי — לא נוצרות משרות Push חדשות'}
              </div>
            </div>
            <div className={`w-12 h-6 rounded-full transition-all duration-200 flex items-center px-0.5 ${(info.automaticPushRemindersEnabled ?? true) ? 'gold-gradient' : 'bg-secondary'}`}>
              <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${(info.automaticPushRemindersEnabled ?? true) ? 'translate-x-0' : 'translate-x-6'}`} />
            </div>
          </button>
        </div>

        <GoldButton onClick={handleSave} disabled={saveSettings.isPending} size="lg" className="w-full">
          {saveSettings.isPending ? 'שומר...' : 'שמור שינויים'}
        </GoldButton>
      </div>
    </div>
  );
}
