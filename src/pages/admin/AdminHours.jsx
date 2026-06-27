import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Plus, Clock, Save, ChevronDown, ChevronUp, Coffee, Trash2, Unlock, Lock } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { BUSINESS_INFO } from '../../lib/businessConfig';
import GoldButton from '../../components/ui/GoldButton';
import {
  saveBookingSettings,
  callPublishManualSlotRelease,
  cancelBookingSlotRelease,
} from '@/lib/businessFirestore';
import {
  useBookingSettingsRealtime,
  useUpcomingBookingSlotReleasesRealtime,
  useAllBarbersRealtime,
} from '@/hooks/useBookingData';
import { toast } from '@/components/ui/use-toast';
import { DATA_LOAD_ERROR_MESSAGE, getUserFacingErrorMessage } from '@/lib/userFacingErrors';

const DEFAULT_DAYS = BUSINESS_INFO.hours.map((h, i) => ({
  day_of_week: i,
  day_name: h.day,
  is_open: h.is_open,
  open_time: h.open || '09:00',
  close_time: h.close || '20:00',
  breaks: [],
}));

const TIME_OPTIONS = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 30) {
    TIME_OPTIONS.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
  }
}

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
};

const DAY_NAMES_HE = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

// Mirrors generateSlotReleaseDates from functions/src/index.js — must stay in sync
const generatePreviewDates = (fromDate, toDate, daysOfWeek) => {
  const today = todayStr();
  const dates = [];
  const start = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return dates;
  const filterDays = daysOfWeek.length > 0 ? new Set(daysOfWeek) : null;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    if (dateStr < today) continue;
    if (filterDays && !filterDays.has(d.getUTCDay())) continue;
    dates.push(dateStr);
    if (dates.length > 90) break;
  }
  return dates;
};

function TimeSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-secondary border border-border rounded-xl px-2 py-2 text-sm text-center focus:outline-none focus:border-primary appearance-none cursor-pointer"
    >
      {TIME_OPTIONS.map(t => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  );
}

function DayCard({ day, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const toggleOpen = () => onUpdate({ ...day, is_open: !day.is_open });
  const updateTime = (field, val) => onUpdate({ ...day, [field]: val });
  const addBreak = () => onUpdate({
    ...day,
    breaks: [...(day.breaks || []), { start: '13:00', end: '14:00', label: 'הפסקה' }]
  });
  const removeBreak = (i) => onUpdate({ ...day, breaks: day.breaks.filter((_, idx) => idx !== i) });
  const updateBreak = (i, field, val) => {
    const updated = day.breaks.map((b, idx) => idx === i ? { ...b, [field]: val } : b);
    onUpdate({ ...day, breaks: updated });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`dark-card rounded-2xl overflow-hidden border ${day.is_open ? 'border-primary/10' : 'border-transparent'}`}
    >
      <div className="flex items-center gap-3 p-4">
        <div
          onClick={toggleOpen}
          className={`w-12 h-6 rounded-full transition-all duration-200 flex items-center px-0.5 cursor-pointer flex-shrink-0 ${
            day.is_open ? 'gold-gradient' : 'bg-secondary'
          }`}
        >
          <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
            day.is_open ? 'translate-x-0' : 'translate-x-6'
          }`} />
        </div>
        <span className={`font-black flex-1 ${day.is_open ? 'text-foreground' : 'text-muted-foreground'}`}>
          {day.day_name}
        </span>
        {day.is_open && (
          <span className="text-xs text-muted-foreground ml-auto">{day.open_time} – {day.close_time}</span>
        )}
        {!day.is_open && <span className="text-xs text-red-400/70 font-bold">סגור</span>}
        {day.is_open && (
          <button onClick={() => setExpanded(e => !e)} className="glass p-1.5 rounded-lg mr-1">
            {expanded ? <ChevronUp className="w-4 h-4 text-primary" /> : <ChevronDown className="w-4 h-4 text-primary" />}
          </button>
        )}
      </div>
      <AnimatePresence>
        {day.is_open && expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/5"
          >
            <div className="p-4 pt-3 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">⏰ פתיחה</label>
                  <TimeSelect value={day.open_time} onChange={v => updateTime('open_time', v)} />
                </div>
                <div className="text-muted-foreground mt-5 text-lg">—</div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">🔒 סגירה</label>
                  <TimeSelect value={day.close_time} onChange={v => updateTime('close_time', v)} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
                    <Coffee className="w-3 h-3" /> הפסקות
                  </label>
                  <button onClick={addBreak} className="flex items-center gap-1 text-primary text-xs font-bold glass px-2 py-1 rounded-lg">
                    <Plus className="w-3 h-3" /> הוסף
                  </button>
                </div>
                {(day.breaks || []).length === 0 && (
                  <p className="text-muted-foreground/60 text-xs">אין הפסקות מוגדרות</p>
                )}
                {(day.breaks || []).map((brk, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2">
                    <input
                      value={brk.label}
                      onChange={e => updateBreak(i, 'label', e.target.value)}
                      placeholder="שם הפסקה"
                      className="flex-1 bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:border-primary"
                      dir="rtl"
                    />
                    <TimeSelect value={brk.start} onChange={v => updateBreak(i, 'start', v)} />
                    <span className="text-muted-foreground text-xs">—</span>
                    <TimeSelect value={brk.end} onChange={v => updateBreak(i, 'end', v)} />
                    <button onClick={() => removeBreak(i)} className="text-red-400 p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SlotReleaseForm({ barbers, onPublish, disabled }) {
  const [fromDate, setFromDate] = useState(todayStr());
  const [toDate, setToDate] = useState(todayStr());
  const [daysOfWeek, setDaysOfWeek] = useState([]); // [] = all days
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [barberId, setBarberId] = useState(barbers[0]?.id || '');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (barbers.length > 0 && !barbers.find(b => b.id === barberId)) {
      setBarberId(barbers[0].id);
    }
  }, [barbers, barberId]);

  const toggleDay = (day) => {
    setDaysOfWeek(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const previewDates = useMemo(
    () => generatePreviewDates(fromDate, toDate, daysOfWeek),
    [fromDate, toDate, daysOfWeek],
  );

  const isValid = fromDate && toDate && fromDate <= toDate
    && barberId && startTime && endTime && startTime < endTime
    && previewDates.length > 0;

  const handlePublish = () => {
    if (!isValid) return;
    onPublish({ fromDate, toDate, daysOfWeek, barberId, startTime, endTime, note });
    setNote('');
  };

  return (
    <div className="space-y-4">
      {/* Date range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">📅 מתאריך</label>
          <input
            type="date"
            value={fromDate}
            min={todayStr()}
            onChange={e => {
              setFromDate(e.target.value);
              if (e.target.value > toDate) setToDate(e.target.value);
            }}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">📅 עד תאריך</label>
          <input
            type="date"
            value={toDate}
            min={fromDate || todayStr()}
            onChange={e => setToDate(e.target.value)}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Days of week */}
      <div>
        <label className="text-xs text-muted-foreground font-semibold mb-2 block">
          ימים בשבוע <span className="font-normal opacity-60">(ריק = כל הימים)</span>
        </label>
        <div className="grid grid-cols-7 gap-1">
          {DAY_NAMES_HE.map((name, idx) => {
            const selected = daysOfWeek.includes(idx);
            return (
              <button
                key={idx}
                onClick={() => toggleDay(idx)}
                className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selected ? 'gold-gradient text-black' : 'glass text-muted-foreground'
                }`}
              >
                {name.slice(0, 2)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time range */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">⏰ משעה</label>
          <TimeSelect value={startTime} onChange={setStartTime} />
        </div>
        <div className="text-muted-foreground mt-5">—</div>
        <div className="flex-1">
          <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">⏰ עד שעה</label>
          <TimeSelect value={endTime} onChange={setEndTime} />
        </div>
      </div>

      {/* Barber (if multiple) */}
      {barbers.length > 1 && (
        <div>
          <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">✂️ ספר</label>
          <select
            value={barberId}
            onChange={e => setBarberId(e.target.value)}
            className="w-full bg-secondary border border-border rounded-xl px-2 py-2 text-sm focus:outline-none focus:border-primary appearance-none cursor-pointer"
          >
            {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}

      {/* Note */}
      <div>
        <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">📝 הערה (אופציונלי)</label>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="למשל: חזרנו מחופשה!"
          className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-right focus:outline-none focus:border-primary"
          dir="rtl"
        />
      </div>

      {/* Preview */}
      {startTime >= endTime && (
        <p className="text-red-400 text-xs">שעת הסיום חייבת להיות אחרי שעת ההתחלה.</p>
      )}
      {isValid && (
        <div className="glass rounded-xl p-3 space-y-2">
          <p className="text-xs font-bold text-primary">
            ייפתחו {previewDates.length} {previewDates.length === 1 ? 'יום' : 'ימים'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {previewDates.slice(0, 14).map(d => (
              <span key={d} className="text-xs bg-primary/10 text-primary rounded-md px-2 py-0.5">
                {formatDate(d)}
              </span>
            ))}
            {previewDates.length > 14 && (
              <span className="text-xs text-muted-foreground px-2 py-0.5">
                +{previewDates.length - 14} עוד...
              </span>
            )}
          </div>
        </div>
      )}

      <GoldButton
        onClick={handlePublish}
        disabled={disabled || !isValid}
        className="w-full"
        size="sm"
      >
        <Unlock className="w-4 h-4 ml-1" /> פתח תורים ושלח התראה
      </GoldButton>
    </div>
  );
}

function SlotReleaseList({ releases, barbers, onCancel, cancellingId }) {
  const barberName = (id) => barbers.find(b => b.id === id)?.name || id;

  if (releases.length === 0) {
    return <p className="text-muted-foreground/60 text-xs text-center py-3">אין שעות מפורסמות</p>;
  }

  return (
    <div className="space-y-2">
      {releases.map((r) => (
        <div key={r.id} className="flex items-center gap-3 glass rounded-xl px-3 py-2.5">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-foreground">
              {formatDate(r.date)}
              {barbers.length > 1 && (
                <span className="text-muted-foreground font-normal"> · {barberName(r.barberId)}</span>
              )}
            </div>
            <div className="text-xs text-primary mt-0.5">
              {r.startTime} – {r.endTime}
              {r.note && <span className="text-muted-foreground"> · {r.note}</span>}
            </div>
          </div>
          <button
            onClick={() => onCancel(r.id)}
            disabled={cancellingId === r.id}
            className="text-red-400/70 hover:text-red-400 p-1.5 glass rounded-lg transition-colors flex-shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function AdminHours() {
  const navigate = useNavigate();
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [appointmentBufferMinutes, setAppointmentBufferMinutes] = useState(0);
  const [slotInterval, setSlotInterval] = useState(10);
  const [visibleSlotIntervalMinutes, setVisibleSlotIntervalMinutes] = useState(30);
  const [availabilityMode, setAvailabilityMode] = useState('automatic');
  const [cancellingId, setCancellingId] = useState(null);

  const { settings, error: settingsError } = useBookingSettingsRealtime();
  const { data: allBarbers } = useAllBarbersRealtime();
  const activeBarbers = useMemo(
    () => allBarbers.filter(b => b.is_active && !b.archived),
    [allBarbers],
  );
  const { data: upcomingReleases } = useUpcomingBookingSlotReleasesRealtime(todayStr());

  useEffect(() => {
    if (!settings) return;
    setDays(DEFAULT_DAYS.map(day => ({
      ...day,
      ...(settings.workingHours.find(item => item.day_of_week === day.day_of_week) || {}),
    })));
    setAppointmentBufferMinutes(
      settings.appointmentBufferMinutes
      ?? settings.defaultAppointmentBufferAfterMinutes
      ?? settings.defaultAppointmentBufferBeforeMinutes
      ?? 0,
    );
    setVisibleSlotIntervalMinutes(settings.visibleSlotIntervalMinutes);
    setSlotInterval(settings.slotInterval);
    setAvailabilityMode(settings.availabilityMode || 'automatic');
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => saveBookingSettings({
      workingHours: days.map((day) => ({
        ...day,
        bufferBeforeMinutes: null,
        bufferAfterMinutes: null,
      })),
      appointmentBufferMinutes,
      defaultAppointmentBufferBeforeMinutes: 0,
      defaultAppointmentBufferAfterMinutes: appointmentBufferMinutes,
      visibleSlotIntervalMinutes,
      slotInterval,
      availabilityMode,
    }),
    onSuccess: () => {
      toast({ title: 'נשמר בהצלחה', description: 'ימי העבודה והזמינות עודכנו בזמן אמת.' });
    },
    onError: (error) => toast({
      variant: 'destructive',
      title: 'שמירת שעות העבודה נכשלה',
      description: getUserFacingErrorMessage(error),
    }),
  });

  const publishMutation = useMutation({
    mutationFn: (input) => callPublishManualSlotRelease(input),
    onSuccess: (result) => {
      const count = result?.datesCreated ?? 0;
      toast({
        title: 'התורים נפתחו ונשלחה התראה ללקוחות',
        description: count === 1 ? 'נפתח יום אחד.' : `נפתחו ${count} ימים.`,
      });
    },
    onError: (error) => toast({
      variant: 'destructive',
      title: 'פרסום השעות נכשל',
      description: getUserFacingErrorMessage(error),
    }),
  });

  const handleCancelRelease = async (id) => {
    setCancellingId(id);
    try {
      await cancelBookingSlotRelease(id);
      toast({ title: 'השעות בוטלו' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'ביטול נכשל', description: getUserFacingErrorMessage(error) });
    } finally {
      setCancellingId(null);
    }
  };

  const updateDay = (updated) => {
    setDays(prev => prev.map(d => d.day_of_week === updated.day_of_week ? updated : d));
  };

  const openDays = days.filter(d => d.is_open).length;
  const isManual = availabilityMode === 'manual';

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky-top-safe z-30 glass border-b border-white/10 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/admin')} className="press-scale">
          <ArrowRight className="w-6 h-6" />
        </button>
        <div>
          <h1 className="font-black text-lg">שעות עבודה</h1>
          <p className="text-muted-foreground text-xs">{openDays} ימי עסקים פעילים</p>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {settingsError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-red-400 text-sm">
            {DATA_LOAD_ERROR_MESSAGE}
          </div>
        )}

        {/* ── Availability mode toggle ── */}
        <div className="glass rounded-2xl p-4 space-y-3">
          <h2 className="text-sm font-black text-foreground">מצב פתיחת תורים</h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setAvailabilityMode('automatic')}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-bold transition-all ${
                !isManual ? 'gold-gradient text-black' : 'glass text-muted-foreground'
              }`}
            >
              <Unlock className="w-4 h-4" />
              אוטומטי
            </button>
            <button
              onClick={() => setAvailabilityMode('manual')}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-bold transition-all ${
                isManual ? 'gold-gradient text-black' : 'glass text-muted-foreground'
              }`}
            >
              <Lock className="w-4 h-4" />
              ידני
            </button>
          </div>
          <p className="text-muted-foreground/70 text-xs">
            {isManual
              ? 'בפתיחה ידנית, הלקוחות רואים רק שעות שאתה משחרר במפורש.'
              : 'בפתיחה אוטומטית, כל שעות העסק הפנויות מוצגות ללקוחות.'}
          </p>
        </div>

        {/* ── Manual slot release panel ── */}
        <AnimatePresence>
          {isManual && (
            <motion.div
              key="manual-panel"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="glass-gold rounded-2xl p-4 space-y-4">
                <h3 className="text-sm font-black text-foreground flex items-center gap-2">
                  <Unlock className="w-4 h-4 text-primary" /> שחרור שעות
                </h3>
                {activeBarbers.length === 0 ? (
                  <p className="text-muted-foreground/60 text-xs">אין ספרים פעילים</p>
                ) : (
                  <SlotReleaseForm
                    barbers={activeBarbers}
                    onPublish={(input) => publishMutation.mutate(input)}
                    disabled={publishMutation.isPending}
                  />
                )}
              </div>

              <div className="glass rounded-2xl p-4 mt-3">
                <h3 className="text-sm font-black text-foreground mb-3">שעות מפורסמות</h3>
                <SlotReleaseList
                  releases={upcomingReleases}
                  barbers={activeBarbers}
                  onCancel={handleCancelRelease}
                  cancellingId={cancellingId}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="glass-gold rounded-2xl p-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-4 h-4 text-primary flex-shrink-0" />
          <span>לחץ על החץ בכל יום לעריכה מלאה של שעות, הפסקות ומרווחי תורים</span>
        </div>

        <div className="glass rounded-2xl p-4 space-y-4">
          <div>
            <label className="text-xs text-muted-foreground font-semibold mb-2 block">מרווח בין תורים בדקות</label>
            <input
              type="number"
              min="0"
              value={appointmentBufferMinutes}
              onChange={e => setAppointmentBufferMinutes(Math.max(0, Number(e.target.value)))}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-center focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-semibold mb-2 block">קפיצת שעות זמינות בדקות</label>
            <div className="grid grid-cols-5 gap-2">
              {[5, 10, 15, 20, 30].map(value => (
                <button
                  key={value}
                  onClick={() => setSlotInterval(value)}
                  className={`py-2 rounded-xl text-xs font-bold ${slotInterval === value ? 'gold-gradient text-black' : 'glass text-muted-foreground'}`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-4 space-y-4">
          <label className="block text-xs text-muted-foreground">
            מרווח תצוגת שעות ללקוח
            <input
              type="number"
              min="1"
              value={visibleSlotIntervalMinutes}
              onChange={e => {
                const value = Math.max(1, Number(e.target.value));
                setVisibleSlotIntervalMinutes(value);
                setSlotInterval(value);
              }}
              className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-center focus:outline-none focus:border-primary"
            />
          </label>
        </div>

        {days.map((day) => (
          <DayCard key={day.day_of_week} day={day} onUpdate={updateDay} />
        ))}
      </div>

      <div className="px-4 pb-8">
        <GoldButton onClick={() => saveMutation.mutate()} size="lg" className="w-full" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'שומר...' : (
            <span className="flex items-center justify-center gap-2"><Save className="w-4 h-4" /> שמור שינויים</span>
          )}
        </GoldButton>
      </div>
    </div>
  );
}
