import React, { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Calendar, Clock, User, CheckCircle2, AlertCircle, BellRing, ChevronLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { localDb } from '@/lib/localData';
import { createCustomerAppointment } from '@/lib/appointmentsFirestore';
import { MOCK_SERVICES } from '../lib/mockData';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { getAvailableSlots, getWorkingHoursForDate, DEFAULT_WORKING_HOURS } from '../lib/slotEngine';
import BarberSelector from '../components/booking/BarberSelector';
import WaitingListModal from '../components/booking/WaitingListModal';
import GoldButton from '../components/ui/GoldButton';

// ─── Calendar helpers ──────────────────────────────────────────────
const MONTH_NAMES_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const DAY_NAMES_SHORT = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

function dateToStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function CalendarPicker({ workingHours, blockedDates, selectedDate, onSelect }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay  = new Date(viewYear, viewMonth + 1, 0);
  const startPad = firstDay.getDay(); // Sunday=0

  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(viewYear, viewMonth, d));

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y=>y-1); } else setViewMonth(m=>m-1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y=>y+1); } else setViewMonth(m=>m+1); };

  const getStatus = (date) => {
    if (!date) return 'empty';
    if (date < today) return 'past';
    const ds = dateToStr(date);
    const wh = workingHours.find(h => h.day_of_week === date.getDay());
    if (!wh || !wh.is_open) return 'closed';
    if (blockedDates.some(b => b.date === ds && b.is_full_day)) return 'blocked';
    return 'open';
  };

  return (
    <div className="glass rounded-3xl p-5">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="glass p-2 rounded-xl press-scale">
          <ChevronLeft className="w-5 h-5 rotate-180" />
        </button>
        <span className="font-black text-lg">{MONTH_NAMES_HE[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} className="glass p-2 rounded-xl press-scale">
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES_SHORT.map(d => (
          <div key={d} className="text-center text-xs text-muted-foreground py-1 font-medium">{d.slice(0,2)}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={`pad-${i}`} />;
          const status = getStatus(date);
          const isSelected = selectedDate && dateToStr(date) === dateToStr(selectedDate);
          const isToday = dateToStr(date) === dateToStr(today);
          return (
            <motion.button
              key={i}
              whileTap={{ scale: 0.88 }}
              disabled={status === 'past' || status === 'closed' || status === 'blocked' || status === 'empty'}
              onClick={() => status === 'open' && onSelect(date)}
              className={`
                aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-bold transition-all
                ${isSelected ? 'gold-gradient text-black' : ''}
                ${!isSelected && status === 'open' ? 'hover:bg-secondary cursor-pointer text-foreground' : ''}
                ${status === 'past' || status === 'closed' ? 'text-muted-foreground/30 cursor-not-allowed' : ''}
                ${status === 'blocked' ? 'text-red-400/60 cursor-not-allowed' : ''}
                ${isToday && !isSelected ? 'ring-1 ring-primary' : ''}
              `}
            >
              {date.getDate()}
              {status === 'blocked' && <span className="w-1 h-1 rounded-full bg-orange-400 mt-0.5" />}
            </motion.button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-4 justify-center text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400/60" />ימים ללא תורים</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" />חופש</span>
      </div>
    </div>
  );
}

// ─── Time of day grouping ─────────────────────────────────────────
const TIME_GROUPS = [
  { key: 'morning', label: 'בבוקר', sublabel: 'עד 12:00', emoji: '🌅', from: '00:00', to: '12:00' },
  { key: 'noon',    label: 'בצהריים', sublabel: '12:00 - 16:00', emoji: '☀️', from: '12:00', to: '16:00' },
  { key: 'evening', label: 'בערב', sublabel: 'מ-16:00', emoji: '🌆', from: '16:00', to: '23:59' },
];

function groupSlots(slots) {
  const groups = {};
  TIME_GROUPS.forEach(g => { groups[g.key] = []; });
  slots.forEach(time => {
    const group = TIME_GROUPS.find(g => time >= g.from && time < g.to);
    if (group) groups[group.key].push(time);
  });
  return groups;
}

// ─── Service card (for booking) ──────────────────────────────────
function ServiceCard({ service, selected, onSelect }) {
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onClick={() => onSelect(service)}
      className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl cursor-pointer transition-all border ${
        selected ? 'border-primary bg-primary/5 gold-shadow' : 'dark-card border-transparent hover:border-border'
      }`}
    >
      <div className="flex-1 text-right">
        <div className="font-bold text-foreground text-sm">{service.name}</div>
        <div className="text-muted-foreground text-xs mt-0.5">{service.duration} דק׳</div>
      </div>
      <div className="text-foreground font-black text-sm flex-shrink-0">₪{service.price}</div>
      <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
        selected ? 'border-primary bg-primary' : 'border-muted-foreground/40'
      }`}>
        {selected && <CheckCircle2 className="w-3.5 h-3.5 text-black" />}
      </div>
    </motion.div>
  );
}

// ─── Main Booking ─────────────────────────────────────────────────
export default function Booking() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useCurrentUser();

  const [step, setStep] = useState(location.state?.service ? 2 : 1);
  const [selectedService, setSelectedService] = useState(location.state?.service || null);
  const [selectedBarber, setSelectedBarber] = useState({ id: 'any', name: 'ללא העדפה' });
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [selectedTimeGroup, setSelectedTimeGroup] = useState(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [showWaiting, setShowWaiting] = useState(false);
  const [bookingError, setBookingError] = useState('');

  const { data: services = MOCK_SERVICES } = useQuery({
    queryKey: ['services'],
    queryFn: () => localDb.Service.filter({ is_active: true }, 'sort_order'),
    placeholderData: MOCK_SERVICES,
  });

  const { data: workingHoursRaw = DEFAULT_WORKING_HOURS } = useQuery({
    queryKey: ['workingHours'],
    queryFn: () => localDb.WorkingHours.list('day_of_week'),
    placeholderData: DEFAULT_WORKING_HOURS,
  });
  const workingHours = workingHoursRaw.length > 0 ? workingHoursRaw : DEFAULT_WORKING_HOURS;

  const { data: blockedDates = [] } = useQuery({
    queryKey: ['blockedDates'],
    queryFn: () => localDb.BlockedDate.list(),
    placeholderData: [],
  });

  const selectedDateStr = selectedDate ? dateToStr(selectedDate) : null;
  const { data: dayAppointments = [] } = useQuery({
    queryKey: ['appointments-day', selectedDateStr],
    queryFn: () => localDb.Appointment.filter({ date: selectedDateStr }),
    enabled: !!selectedDateStr,
    placeholderData: [],
  });

  const isDateBlocked = useMemo(() => {
    if (!selectedDate) return false;
    return blockedDates.some(b => b.date === dateToStr(selectedDate) && b.is_full_day);
  }, [selectedDate, blockedDates]);

  const availableSlots = useMemo(() => {
    if (!selectedDate || !selectedService || isDateBlocked) return [];
    const ds = dateToStr(selectedDate);
    const wh = getWorkingHoursForDate(ds, workingHours);
    if (!wh || !wh.is_open) return [];
    return getAvailableSlots({
      date: ds,
      serviceDuration: selectedService.duration,
      appointments: dayAppointments,
      workingHours: wh,
      blockedTimes: [],
      slotInterval: 10,
      bufferMinutes: 0,
    });
  }, [selectedDate, selectedService, dayAppointments, workingHours, isDateBlocked]);

  const slotGroups = useMemo(() => groupSlots(availableSlots), [availableSlots]);

  const handleConfirm = async () => {
    if (!currentUser) { navigate('/login', { state: { next: '/booking' } }); return; }
    setLoading(true);
    setBookingError('');
    try {
      await createCustomerAppointment({
        customerName: currentUser.name,
        customerPhone: currentUser.phone || '',
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        servicePrice: selectedService.price,
        serviceDuration: selectedService.duration,
        date: selectedDateStr,
        startTime: selectedTime,
        barberId: selectedBarber?.id !== 'any' ? selectedBarber.id : null,
        barberName: selectedBarber?.id !== 'any' ? selectedBarber.name : null,
        notes,
      });
      setConfirmed(true);
    } catch {
      setBookingError('לא הצלחנו לשמור את התור. נסו שוב.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Confirmed screen ─────────────────────────────
  if (confirmed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6 page-transition" dir="rtl">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300 }}
          className="text-center max-w-sm w-full"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 400 }}
            className="w-24 h-24 gold-gradient rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <CheckCircle2 className="w-12 h-12 text-black" />
          </motion.div>
          <h2 className="text-3xl font-black mb-2">התור נקבע! 🎉</h2>
          <p className="text-muted-foreground mb-6">נשלח אישור ותזכורת ב-WhatsApp</p>
          <div className="glass rounded-2xl p-5 text-right mb-6 space-y-3">
            {[
              { label: 'שירות', value: selectedService.name },
              { label: 'ספר', value: selectedBarber?.id !== 'any' ? selectedBarber.name : 'כל ספר' },
              { label: 'תאריך', value: selectedDate?.toLocaleDateString('he-IL') },
              { label: 'שעה', value: selectedTime },
              { label: 'מחיר', value: `₪${selectedService.price}`, highlight: true },
            ].map(({ label, value, highlight }) => (
              <div key={label} className="flex justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span className={`font-bold ${highlight ? 'text-primary' : ''}`}>{value}</span>
              </div>
            ))}
          </div>
          <GoldButton onClick={() => navigate('/appointments')} size="lg" className="w-full mb-3">צפה בתורים שלי</GoldButton>
          <button onClick={() => navigate('/')} className="text-muted-foreground text-sm">חזרה לדף הבית</button>
        </motion.div>
      </div>
    );
  }

  const serviceList = (services.length > 0 ? services : MOCK_SERVICES).filter(s => s.is_active !== false);

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-30 glass border-b border-white/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => step > 1 ? setStep(step - 1) : navigate(-1)} className="press-scale">
            <ArrowRight className="w-6 h-6" />
          </button>
          <div className="flex-1">
            <h1 className="font-black text-lg">הזמנת תור</h1>
            <p className="text-muted-foreground text-xs">שלב {step} מתוך 3</p>
          </div>
          <button
            onClick={() => setShowWaiting(true)}
            className="glass px-3 py-1.5 rounded-xl text-xs font-bold text-primary flex items-center gap-1"
          >
            <BellRing className="w-3 h-3" /> המתנה
          </button>
        </div>
        <div className="flex gap-1.5 mt-3">
          {[1,2,3].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-all duration-300 ${s <= step ? 'gold-gradient' : 'bg-secondary'}`} />
          ))}
        </div>
      </div>

      <div className="px-4 py-6">
        <AnimatePresence mode="wait">

          {/* ── STEP 1: Barber + Service ── */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <h2 className="text-xl font-black mb-1">בחירת שירות</h2>
              <p className="text-muted-foreground text-sm mb-5">שלב 1 מתוך 3</p>

              {/* Barber */}
              <div className="glass rounded-2xl p-4 mb-5">
                <BarberSelector selectedBarber={selectedBarber} onSelect={setSelectedBarber} />
              </div>

              {/* Services by category */}
              <div className="mb-4">
                <p className="text-xs text-muted-foreground font-semibold mb-2 px-1">תספורות</p>
                <div className="space-y-2">
                  {serviceList.filter(s => s.name !== 'עיצוב זקן' && s.name !== 'חבילת פרימיום').map(service => (
                    <ServiceCard key={service.id} service={service} selected={selectedService?.id === service.id}
                      onSelect={(s) => { setSelectedService(s); setSelectedTime(null); }} />
                  ))}
                </div>
              </div>
              <div className="mb-4">
                <p className="text-xs text-muted-foreground font-semibold mb-2 px-1">עיצוב זקן</p>
                <div className="space-y-2">
                  {serviceList.filter(s => s.name === 'עיצוב זקן').map(service => (
                    <ServiceCard key={service.id} service={service} selected={selectedService?.id === service.id}
                      onSelect={(s) => { setSelectedService(s); setSelectedTime(null); }} />
                  ))}
                </div>
              </div>
              <div className="mb-6">
                <p className="text-xs text-muted-foreground font-semibold mb-2 px-1">חבילות</p>
                <div className="space-y-2">
                  {serviceList.filter(s => s.name === 'חבילת פרימיום').map(service => (
                    <ServiceCard key={service.id} service={service} selected={selectedService?.id === service.id}
                      onSelect={(s) => { setSelectedService(s); setSelectedTime(null); }} />
                  ))}
                </div>
              </div>

              {selectedService && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <GoldButton onClick={() => setStep(2)} size="lg" className="w-full">המשך לבחירת יום</GoldButton>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ── STEP 2: Calendar → Time ── */}
          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              {/* Summary pill */}
              <div className="glass-gold rounded-2xl p-3 mb-5 flex justify-between items-center">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>{selectedService?.duration} דק'</span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-sm">{selectedService?.name}</span>
                  <span className="text-primary font-black mr-2">₪{selectedService?.price}</span>
                </div>
              </div>

              {/* Calendar */}
              <h2 className="text-lg font-black mb-3 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" /> בחירת יום
              </h2>
              <CalendarPicker
                workingHours={workingHours}
                blockedDates={blockedDates}
                selectedDate={selectedDate}
                onSelect={(d) => { setSelectedDate(d); setSelectedTime(null); setSelectedTimeGroup(null); }}
              />

              {/* Time selection */}
              {selectedDate && !isDateBlocked && (
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
                  <h3 className="font-black mb-1 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" /> מתי תרצה להגיע?
                  </h3>
                  <p className="text-xs text-muted-foreground mb-4">ניתן לבחור יותר מאפשרות אחת!</p>

                  {availableSlots.length === 0 ? (
                    <div className="glass rounded-2xl p-6 text-center">
                      <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground text-sm">אין שעות פנויות ביום זה</p>
                      <button onClick={() => setShowWaiting(true)} className="mt-3 text-primary font-bold text-sm flex items-center gap-1 mx-auto">
                        <BellRing className="w-4 h-4" /> הצטרף לרשימת המתנה
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Time-of-day group selector */}
                      {!selectedTimeGroup ? (
                        <div className="grid grid-cols-3 gap-3">
                          {TIME_GROUPS.map(g => {
                            const count = slotGroups[g.key]?.length || 0;
                            return (
                              <motion.button
                                key={g.key}
                                whileTap={{ scale: 0.92 }}
                                disabled={count === 0}
                                onClick={() => setSelectedTimeGroup(g.key)}
                                className={`glass rounded-2xl p-4 flex flex-col items-center gap-2 transition-all ${
                                  count === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:border-primary/40 border border-transparent press-scale'
                                }`}
                              >
                                <span className="text-3xl">{g.emoji}</span>
                                <span className="font-bold text-sm">{g.label}</span>
                                <span className="text-xs text-muted-foreground">{g.sublabel}</span>
                                <span className={`text-xs font-bold ${count > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                                  {count > 0 ? `${count} זמינים` : 'לא פנוי'}
                                </span>
                              </motion.button>
                            );
                          })}
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <button onClick={() => { setSelectedTimeGroup(null); setSelectedTime(null); }} className="flex items-center gap-1 text-muted-foreground text-sm">
                              <ArrowRight className="w-4 h-4" /> חזרה לבחירת זמן
                            </button>
                            <span className="text-sm font-bold">
                              {TIME_GROUPS.find(g => g.key === selectedTimeGroup)?.emoji} {TIME_GROUPS.find(g => g.key === selectedTimeGroup)?.label}
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {(slotGroups[selectedTimeGroup] || []).map(time => (
                              <motion.button
                                key={time}
                                whileTap={{ scale: 0.92 }}
                                onClick={() => setSelectedTime(time)}
                                className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                                  selectedTime === time ? 'gold-gradient text-black' : 'glass hover:border-primary/50'
                                }`}
                              >
                                {time}
                              </motion.button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              )}

              {selectedDate && isDateBlocked && (
                <div className="glass rounded-2xl p-6 text-center mt-5">
                  <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">יום זה חסום</p>
                </div>
              )}

              {selectedDate && selectedTime && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
                  <GoldButton onClick={() => setStep(3)} size="lg" className="w-full">המשך לאישור</GoldButton>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ── STEP 3: Confirm ── */}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <h2 className="text-xl font-black mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-primary" /> אישור תור
              </h2>
              <div className="glass rounded-2xl p-5 mb-5 space-y-4">
                {[
                  { label: 'שירות', value: selectedService?.name },
                  { label: 'ספר', value: selectedBarber?.id !== 'any' ? selectedBarber.name : 'כל ספר' },
                  { label: 'תאריך', value: selectedDate?.toLocaleDateString('he-IL', { weekday:'long', year:'numeric', month:'long', day:'numeric' }) },
                  { label: 'שעה', value: selectedTime },
                  { label: 'משך', value: `${selectedService?.duration} דקות` },
                  { label: 'מחיר', value: `₪${selectedService?.price}`, highlight: true },
                ].map(({ label, value, highlight }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={`font-bold ${highlight ? 'text-primary text-lg' : 'text-foreground'}`}>{value}</span>
                  </div>
                ))}
              </div>
              <div className="glass-gold rounded-2xl p-3 mb-4 flex items-center gap-2">
                <BellRing className="w-4 h-4 text-primary flex-shrink-0" />
                <p className="text-xs text-muted-foreground">תקבל תזכורת WhatsApp 24 שעות ו-2 שעות לפני התור</p>
              </div>
              <div className="mb-5">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">הערות (אופציונלי)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="כגון: סגנון ספציפי, העדפות..."
                  className="w-full bg-secondary border border-border rounded-2xl px-4 py-3 text-foreground text-right placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none h-24"
                  dir="rtl"
                />
              </div>
              {!currentUser && (
                <div className="glass-gold rounded-2xl p-4 mb-4 text-center">
                  <p className="text-primary font-bold text-sm">יש להתחבר לפני אישור התור</p>
                </div>
              )}
              {bookingError && (
                <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-3 mb-4 text-center text-red-400 text-sm font-bold">
                  {bookingError}
                </div>
              )}
              <GoldButton onClick={handleConfirm} size="lg" className="w-full" disabled={loading}>
                {loading ? 'מאשר...' : currentUser ? 'אשר תור' : 'התחבר ואשר'}
              </GoldButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <WaitingListModal
        isOpen={showWaiting}
        onClose={() => setShowWaiting(false)}
        currentUser={currentUser}
        serviceName={selectedService?.name}
      />
    </div>
  );
}
