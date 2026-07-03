import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, onSnapshot } from 'firebase/firestore';
import { ArrowRight, Calendar, Clock, User, CheckCircle2, AlertCircle, BellRing, ChevronLeft } from 'lucide-react';
import {
  createCustomerAppointment,
  replaceCustomerAppointment,
} from '@/lib/appointmentsFirestore';
import { createWaitingListEntry } from '@/lib/waitingListFirestore';
import {
  BOOKING_STATUS_LABELS,
  getBookingRejectionMessage,
} from '@/lib/bookingErrors';
import {
  useActiveBarbersRealtime,
  useActiveServicesRealtime,
  useAppointmentBlocksRealtime,
  useBusinessSettingsRealtime,
  useBookingSettingsRealtime,
  useBookingSlotReleasesRealtime,
  useUpcomingBookingSlotReleasesRealtime,
} from '@/hooks/useBookingData';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { getWorkingHoursForDate, DEFAULT_WORKING_HOURS } from '../lib/slotEngine';
import { isAppointmentActiveForSchedule } from '@/lib/appointmentStatus';
import { isBarberBookable } from '@/lib/businessFirestore';
import {
  ALL_BARBERS_OPTION,
  buildAvailabilitySlots,
  getManualReleaseStateForDate,
  getReleasedDateSet,
  isAllBarbersSelection,
} from '@/lib/bookingAvailability';
import { getFirestoreDb } from '@/lib/firebase';
import BarberSelector from '../components/booking/BarberSelector';
import GoldButton from '../components/ui/GoldButton';
import { useCustomerAppointmentsRealtime } from '@/hooks/useAppointmentsRealtime';
import { toast } from '@/components/ui/use-toast';

// ─── Calendar helpers ──────────────────────────────────────────────
const MONTH_NAMES_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const DAY_NAMES_SHORT = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

function dateToStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function CalendarPicker({
  workingHours,
  blockedDates,
  selectedDate,
  onSelect,
  availabilityMode = 'automatic',
  manualReleases = [],
  selectedBarberId = null,
  activeBarberIds = [],
}) {
  const today = new Date(); today.setHours(0,0,0,0);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const isManualMode = availabilityMode === 'manual';
  const releasedDates = useMemo(() => getReleasedDateSet(
    manualReleases,
    selectedBarberId,
    activeBarberIds,
  ), [manualReleases, selectedBarberId, activeBarberIds]);

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
    if (blockedDates.some(b => b.date === ds && b.is_full_day)) return 'blocked';
    if (isManualMode) return releasedDates.has(ds) ? 'open' : 'unreleased';
    const wh = workingHours.find(h => h.day_of_week === date.getDay());
    if (!wh || !wh.is_open) return 'closed';
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
          const isSelectable = status === 'open' || status === 'unreleased';
          return (
            <motion.button
              key={i}
              whileTap={{ scale: 0.88 }}
              disabled={!isSelectable}
              onClick={() => isSelectable && onSelect(date, status)}
              className={`
                aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-bold transition-all
                ${isSelected && status === 'open' ? 'gold-gradient text-black' : ''}
                ${isSelected && status === 'unreleased' ? 'ring-1 ring-white/30 bg-white/[0.06] text-muted-foreground' : ''}
                ${!isSelected && status === 'open' ? 'hover:bg-secondary cursor-pointer text-foreground' : ''}
                ${!isSelected && status === 'open' && isManualMode ? 'border border-primary/30 bg-primary/10 text-primary' : ''}
                ${status === 'past' || status === 'closed' ? 'text-muted-foreground/30 cursor-not-allowed' : ''}
                ${status === 'blocked' ? 'text-red-400/60 cursor-not-allowed' : ''}
                ${!isSelected && status === 'unreleased' ? 'text-muted-foreground/45 bg-white/[0.02] cursor-pointer' : ''}
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
      {isManualMode && (
        <div className="flex flex-wrap gap-3 mt-4 justify-center text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" />פתוח לקביעה</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-white/20" />עדיין לא נפתח</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" />אין שעות פנויות</span>
        </div>
      )}
      <div className={`${isManualMode ? 'hidden' : 'flex'} gap-4 mt-4 justify-center text-xs text-muted-foreground`}>
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
  slots.forEach(slot => {
    const time = slot.time || slot;
    const group = TIME_GROUPS.find(g => time >= g.from && time < g.to);
    if (group) groups[group.key].push(slot);
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
  const { currentUser, isAdmin, exitAdminPreview } = useCurrentUser();

  const preselect = location.state?.preselect || null;
  const [step, setStep] = useState(location.state?.service ? 2 : 1);
  const [selectedService, setSelectedService] = useState(location.state?.service || null);
  const [selectedBarber, setSelectedBarber] = useState(null);
  const [preselectApplied, setPreselectApplied] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedTimeGroup, setSelectedTimeGroup] = useState(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [replacementMode, setReplacementMode] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [waitingListOpen, setWaitingListOpen] = useState(false);
  const [waitingListPreferenceType, setWaitingListPreferenceType] = useState('whole_day');
  const [waitingListExactTime, setWaitingListExactTime] = useState('');
  const [waitingListStartTime, setWaitingListStartTime] = useState('');
  const [waitingListEndTime, setWaitingListEndTime] = useState('');
  const [waitingListDayPart, setWaitingListDayPart] = useState('morning');
  const [waitingListLoading, setWaitingListLoading] = useState(false);
  const [waitingListMessage, setWaitingListMessage] = useState('');

  const { data: services } = useActiveServicesRealtime();
  const { data: barbers } = useActiveBarbersRealtime();
  const { appointments: customerAppointments } = useCustomerAppointmentsRealtime(Boolean(currentUser));
  const { settings: bookingSettings } = useBookingSettingsRealtime();
  const { settings: businessSettings } = useBusinessSettingsRealtime();
  const workingHours = bookingSettings?.workingHours || DEFAULT_WORKING_HOURS;

  const blockedDates = [];
  const todayForReleases = useMemo(() => dateToStr(new Date()), []);

  const selectedDateStr = selectedDate ? dateToStr(selectedDate) : null;
  const { data: appointmentBlocks } = useAppointmentBlocksRealtime(selectedDateStr);
  const { data: slotReleases } = useBookingSlotReleasesRealtime(selectedDateStr);
  const { data: upcomingSlotReleases } = useUpcomingBookingSlotReleasesRealtime(todayForReleases);
  const activeAppointment = customerAppointments.find((appointment) =>
    isAppointmentActiveForSchedule(appointment));
  const isManualMode = bookingSettings?.availabilityMode === 'manual';
  const activeBarberIds = useMemo(() => barbers.map((barber) => barber.id), [barbers]);
  const isAllBarbersMode = isAllBarbersSelection(selectedBarber);
  const selectedSpecificBarberId = isAllBarbersMode ? null : selectedBarber?.id || null;
  const selectedAppointmentBarberName = selectedSlot?.barberName || selectedBarber?.name || '';

  // Temporary debug logging for "no active barbers" investigation — remove once confirmed fixed.
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(getFirestoreDb(), 'barbers'),
      (snapshot) => {
        const rawBarbers = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        const mappedCount = rawBarbers.length;
        const bookableCount = rawBarbers.filter(isBarberBookable).length;
        const blockedReason = (b) => {
          if (b?.archived === true) return 'archived';
          if (b?.active === false) return 'active_false';
          if (b?.is_active === false) return 'is_active_false';
          return null;
        };
        console.info('[BOOKING_BARBERS_DEBUG]', {
          rawCount: snapshot.docs.length,
          mappedCount,
          bookableCount,
          barbers: rawBarbers.map((b) => ({
            id: b.id,
            name: b.name,
            active: b.active,
            is_active: b.is_active,
            archived: b.archived,
            available: b.available,
            isAvailable: b.isAvailable,
            isBookable: isBarberBookable(b),
            blockedReason: blockedReason(b),
          })),
        });
      },
      (err) => console.warn('[BOOKING_BARBERS_DEBUG] subscription error', err?.code, err?.message),
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (barbers.length === 1 && selectedBarber?.id !== barbers[0].id) {
      setSelectedBarber(barbers[0]);
    } else if (barbers.length > 1 && !selectedBarber) {
      setSelectedBarber(ALL_BARBERS_OPTION);
    } else if (
      selectedBarber
      && !isAllBarbersSelection(selectedBarber)
      && !barbers.some((barber) => barber.id === selectedBarber.id)
    ) {
      setSelectedBarber(barbers.length > 1 ? ALL_BARBERS_OPTION : null);
    }
  }, [barbers, selectedBarber]);

  useEffect(() => {
    if (!selectedService || services.length === 0) return;
    const currentService = services.find(service => service.id === selectedService.id);
    if (currentService) {
      if (currentService !== selectedService) setSelectedService(currentService);
      return;
    }
    setSelectedService(null);
    setSelectedTime(null);
    setSelectedSlot(null);
    setStep(1);
  }, [services, selectedService]);

  // Apply free-slot preselect from notification deep-link
  useEffect(() => {
    if (!preselect || preselectApplied || services.length === 0) return;
    setPreselectApplied(true);
    if (preselect.serviceId) {
      const svc = services.find(s => s.id === preselect.serviceId);
      if (svc) setSelectedService(svc);
    }
    if (preselect.date) {
      const [year, month, day] = preselect.date.split('-').map(Number);
      if (year && month && day) setSelectedDate(new Date(year, month - 1, day));
    }
    if (preselect.barberId && barbers.length > 0) {
      const barber = barbers.find(b => b.id === preselect.barberId);
      if (barber) setSelectedBarber(barber);
    }
    if (preselect.serviceId || preselect.date) setStep(2);
  }, [preselect, preselectApplied, services, barbers]);

  const isDateBlocked = useMemo(() => {
    if (!selectedDate) return false;
    return blockedDates.some(b => b.date === dateToStr(selectedDate) && b.is_full_day);
  }, [selectedDate, blockedDates]);

  const availableSlots = useMemo(() => {
    if (!selectedDate) return [];
    const ds = dateToStr(selectedDate);
    return buildAvailabilitySlots({
      date: ds,
      selectedService,
      selectedBarber,
      barbers,
      appointmentBlocks,
      workingHours,
      bookingSettings: bookingSettings || {},
      slotReleases,
      isDateBlocked,
    });
  }, [selectedDate, selectedService, selectedBarber, barbers, appointmentBlocks, workingHours, isDateBlocked, bookingSettings, slotReleases]);

  const slotGroups = useMemo(() => groupSlots(availableSlots), [availableSlots]);
  const selectedManualReleaseState = useMemo(() => getManualReleaseStateForDate({
    date: selectedDateStr,
    releases: selectedDateStr ? slotReleases : upcomingSlotReleases,
    selectedBarberId: selectedSpecificBarberId,
    activeBarberIds,
  }), [selectedDateStr, slotReleases, upcomingSlotReleases, selectedSpecificBarberId, activeBarberIds]);
  const overallManualReleaseState = useMemo(() => getManualReleaseStateForDate({
    date: selectedDateStr || todayForReleases,
    releases: upcomingSlotReleases,
    selectedBarberId: selectedSpecificBarberId,
    activeBarberIds,
  }), [selectedDateStr, todayForReleases, upcomingSlotReleases, selectedSpecificBarberId, activeBarberIds]);
  const selectedDateIsUnreleased = Boolean(
    isManualMode
    && selectedDate
    && !selectedManualReleaseState.hasReleaseOnDate,
  );
  const emptyAvailabilityMessage = useMemo(() => {
    if (!selectedDate || !selectedService) return 'אין שעות פנויות ביום זה';
    if (isManualMode) {
      if (!overallManualReleaseState.hasAnyReleaseForSelection) {
        return isAllBarbersMode
          ? 'עדיין לא נפתחו תורים לאף ספר. אפשר להצטרף לרשימת המתנה ונעדכן כשייפתחו תורים.'
          : 'עדיין לא נפתחו תורים לספר הזה. אפשר להצטרף לרשימת המתנה ונעדכן כשייפתחו תורים.';
      }
      if (selectedDateIsUnreleased) {
        return isAllBarbersMode
          ? 'לא נפתחו תורים בתאריך הזה. אפשר להצטרף לרשימת המתנה לתאריך הזה.'
          : 'לא נפתחו תורים לספר הזה בתאריך שבחרת. אפשר להצטרף לרשימת המתנה לתאריך הזה.';
      }
      return 'כל התורים שנפתחו בתאריך הזה כבר נתפסו. אפשר להצטרף לרשימת המתנה.';
    }
    const hours = getWorkingHoursForDate(dateToStr(selectedDate), workingHours);
    if (!hours?.is_open) return 'העסק סגור ביום הזה.';
    const [openHour, openMinute] = String(hours.open_time || '00:00').split(':').map(Number);
    const [closeHour, closeMinute] = String(hours.close_time || '00:00').split(':').map(Number);
    const availableMinutes = ((closeHour * 60) + closeMinute) - ((openHour * 60) + openMinute);
    if (Number(selectedService.duration) > availableMinutes) {
      return 'משך השירות לא נכנס בחלון הזמן הפנוי.';
    }
    return 'אין שעות פנויות ביום זה';
  }, [
    selectedDate,
    selectedService,
    isManualMode,
    overallManualReleaseState,
    selectedDateIsUnreleased,
    isAllBarbersMode,
    workingHours,
  ]);

  useEffect(() => {
    if (!preselect?.startTime || !selectedDate || !selectedService) return;
    if (availableSlots.length === 0) return;
    const matchingSlot = availableSlots.find((slot) => (
      slot.time === preselect.startTime
      && (!preselect.barberId || slot.barberId === preselect.barberId)
    ));
    if (matchingSlot) {
      setSelectedTime(matchingSlot.time);
      setSelectedSlot(matchingSlot);
      const group = TIME_GROUPS.find(item => preselect.startTime >= item.from && preselect.startTime < item.to);
      if (group) setSelectedTimeGroup(group.key);
      setBookingError('');
      return;
    }
    setSelectedTime(null);
    setSelectedSlot(null);
    setBookingError('השעה שהתפנתה כבר נתפסה. בחר שעה אחרת.');
  }, [preselect, selectedDate, selectedService, availableSlots]);

  useEffect(() => {
    if (!selectedSlot) return;
    const stillAvailable = availableSlots.some((slot) => slot.id === selectedSlot.id);
    if (!stillAvailable) {
      setSelectedTime(null);
      setSelectedSlot(null);
    }
  }, [availableSlots, selectedSlot]);

  const waitingPreferenceHasAvailableSlot = () => {
    if (selectedDateIsUnreleased) return false;
    if (availableSlots.length === 0) return false;
    if (waitingListPreferenceType === 'exact_time') {
      return availableSlots.some((slot) => slot.time === waitingListExactTime);
    }
    if (waitingListPreferenceType === 'time_range') {
      return availableSlots.some((slot) => slot.time >= waitingListStartTime && slot.time <= waitingListEndTime);
    }
    if (waitingListPreferenceType === 'day_part') {
      const group = TIME_GROUPS.find((item) => item.key === waitingListDayPart);
      if (!group) return false;
      return availableSlots.some((slot) => slot.time >= group.from && slot.time < group.to);
    }
    return true;
  };

  if (isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6 page-transition" dir="rtl">
        <div className="glass rounded-3xl p-6 text-center max-w-sm">
          <Calendar className="w-12 h-12 text-primary mx-auto mb-3" />
          <h2 className="text-xl font-black mb-2">תצוגת לקוח בלבד</h2>
          <p className="text-muted-foreground text-sm mb-5">
            מנהל לא יכול לקבוע תור מתוך מסך הלקוח. כדי ליצור תור ידני, חזור לניהול והשתמש במסך התורים.
          </p>
          <GoldButton
            onClick={() => {
              exitAdminPreview();
              navigate('/admin/appointments');
            }}
            className="w-full"
          >
            חזרה לניהול תורים
          </GoldButton>
        </div>
      </div>
    );
  }

  const handleConfirm = async () => {
    if (!currentUser) { navigate('/login', { state: { next: '/booking' } }); return; }
    if (!policyAccepted) {
      setBookingError('יש לאשר את מדיניות העסק לפני קביעת התור.');
      return;
    }
    setLoading(true);
    setBookingError('');
    try {
      const appointmentBarberId = selectedSlot?.barberId || (!isAllBarbersMode ? selectedBarber?.id : '');
      const appointmentBarberName = selectedSlot?.barberName || (!isAllBarbersMode ? selectedBarber?.name : '');
      if (!appointmentBarberId) {
        setBookingError('יש לבחור שעה פנויה עם ספר זמין.');
        setLoading(false);
        return;
      }
      const appointmentInput = {
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        servicePrice: selectedService.price,
        serviceDuration: selectedService.duration,
        date: selectedDateStr,
        startTime: selectedTime,
        barberId: appointmentBarberId,
        barberName: appointmentBarberName,
        notes,
        policyAccepted: true,
        policyVersion: businessSettings?.bookingPolicyVersion || '2026-06-16',
      };
      if (replacementMode && activeAppointment) {
        await replaceCustomerAppointment(activeAppointment.id, appointmentInput);
      } else {
        await createCustomerAppointment(appointmentInput);
      }
      setConfirmed(true);
    } catch (error) {
      setBookingError(getBookingRejectionMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleJoinWaitingList = async () => {
    if (!currentUser) {
      navigate('/login', { state: { next: '/booking' } });
      return;
    }
    if (!selectedDateStr || !selectedService) {
      setWaitingListMessage('יש לבחור שירות ותאריך לפני הצטרפות לרשימת המתנה.');
      return;
    }
    if (waitingListPreferenceType === 'exact_time' && !waitingListExactTime) {
      setWaitingListMessage('יש לבחור שעה מדויקת.');
      return;
    }
    if (
      waitingListPreferenceType === 'time_range'
      && (!waitingListStartTime || !waitingListEndTime || waitingListStartTime >= waitingListEndTime)
    ) {
      setWaitingListMessage('יש לבחור טווח שעות תקין.');
      return;
    }
    if (waitingPreferenceHasAvailableSlot()) {
      const message = 'התור הזה פנוי, ניתן להזמין אותו עכשיו';
      setWaitingListMessage(message);
      toast({ title: message, description: 'בחר את השעה הפנויה במסך ההזמנה כדי לקבוע תור.' });
      return;
    }

    setWaitingListLoading(true);
    setWaitingListMessage('');
    try {
      await createWaitingListEntry({
        date: selectedDateStr,
        preferenceType: waitingListPreferenceType,
        exactTime: waitingListExactTime,
        startTime: waitingListStartTime,
        endTime: waitingListEndTime,
        dayPart: waitingListDayPart,
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        barberId: isAllBarbersMode ? null : selectedBarber?.id,
        barberName: isAllBarbersMode ? ALL_BARBERS_OPTION.name : selectedBarber?.name,
        barberMode: isAllBarbersMode ? 'all' : 'single',
        source: selectedDateIsUnreleased ? 'unreleased_day' : 'booking_waitlist',
      });
      setWaitingListMessage('נכנסת לרשימת ההמתנה. נעדכן אותך אם יתפנה תור מתאים.');
      toast({ title: 'נכנסת לרשימת ההמתנה', description: 'אם יתפנה תור מתאים, תישלח אליך הודעה.' });
    } catch (error) {
      console.error('[Firestore] Waiting list create failed', {
        code: error?.code || 'unknown',
        message: error?.message || 'Unknown Firestore error',
      });
      const errorCode = error?.details?.code || error?.code;
      const message = errorCode === 'waiting-list/slot-available'
        ? 'התור הזה פנוי, ניתן להזמין אותו עכשיו'
        : errorCode === 'waiting-list/active-limit'
          ? 'כבר יש לך בקשת המתנה פעילה. ניתן להסיר אותה במסך התורים שלי.'
          : 'אירעה תקלה זמנית. נסה שוב.';
      setWaitingListMessage(message);
      toast({ variant: 'destructive', title: 'הצטרפות לרשימת המתנה נכשלה', description: message });
    } finally {
      setWaitingListLoading(false);
    }
  };

  const waitingListPanel = selectedDate && selectedService ? (
    <div className="mt-4 glass-gold rounded-2xl p-4 text-right">
      <div className="flex items-center gap-2 mb-3">
        <BellRing className="w-4 h-4 text-primary" />
        <h4 className="font-black text-sm">רוצה שנעדכן אותך אם יתפנה?</h4>
      </div>
      <p className="text-muted-foreground text-xs leading-5 mb-3">
        בחר העדפת זמן ונוסיף אותך לרשימת ההמתנה. ההודעה לא שומרת לך תור אוטומטית.
      </p>
      <button
        type="button"
        onClick={() => setWaitingListOpen((open) => !open)}
        className="w-full rounded-xl bg-primary/15 text-primary px-4 py-3 text-sm font-bold"
      >
        {waitingListOpen
          ? 'סגור רשימת המתנה'
          : (selectedDateIsUnreleased ? 'הצטרפות לרשימת המתנה לתאריך הזה' : 'הצטרף לרשימת המתנה')}
      </button>

      {waitingListOpen && (
        <div className="mt-4 space-y-3">
          <label className="text-sm font-bold block">
            העדפת זמן
            <select
              value={waitingListPreferenceType}
              onChange={(event) => setWaitingListPreferenceType(event.target.value)}
              className="mt-2 w-full bg-secondary border border-border rounded-xl px-3 py-3 text-right focus:outline-none focus:border-primary"
            >
              <option value="whole_day">כל היום</option>
              <option value="day_part">חלק ביום</option>
              <option value="time_range">טווח שעות</option>
              <option value="exact_time">שעה מדויקת</option>
            </select>
          </label>

          {waitingListPreferenceType === 'day_part' && (
            <label className="text-sm font-bold block">
              חלק ביום
              <select
                value={waitingListDayPart}
                onChange={(event) => setWaitingListDayPart(event.target.value)}
                className="mt-2 w-full bg-secondary border border-border rounded-xl px-3 py-3 text-right focus:outline-none focus:border-primary"
              >
                <option value="morning">בוקר</option>
                <option value="noon">צהריים</option>
                <option value="evening">ערב</option>
              </select>
            </label>
          )}

          {waitingListPreferenceType === 'exact_time' && (
            <label className="text-sm font-bold block">
              שעה מדויקת
              <input
                type="time"
                value={waitingListExactTime}
                onChange={(event) => setWaitingListExactTime(event.target.value)}
                className="mt-2 w-full bg-secondary border border-border rounded-xl px-3 py-3 text-right focus:outline-none focus:border-primary"
              />
            </label>
          )}

          {waitingListPreferenceType === 'time_range' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-bold block">
                משעה
                <input
                  type="time"
                  value={waitingListStartTime}
                  onChange={(event) => setWaitingListStartTime(event.target.value)}
                  className="mt-2 w-full bg-secondary border border-border rounded-xl px-3 py-3 text-right focus:outline-none focus:border-primary"
                />
              </label>
              <label className="text-sm font-bold block">
                עד שעה
                <input
                  type="time"
                  value={waitingListEndTime}
                  onChange={(event) => setWaitingListEndTime(event.target.value)}
                  className="mt-2 w-full bg-secondary border border-border rounded-xl px-3 py-3 text-right focus:outline-none focus:border-primary"
                />
              </label>
            </div>
          )}

          {waitingListMessage && (
            <p className={`text-sm text-center font-bold ${waitingListMessage.includes('נכנסת') ? 'text-primary' : 'text-red-400'}`}>
              {waitingListMessage}
            </p>
          )}

          <GoldButton
            onClick={handleJoinWaitingList}
            disabled={waitingListLoading}
            className="w-full"
          >
            {waitingListLoading ? 'מוסיף...' : 'אשר הצטרפות לרשימת המתנה'}
          </GoldButton>
        </div>
      )}
    </div>
  ) : null;

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
              { label: 'ספר', value: selectedAppointmentBarberName },
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

  const blockedReason = currentUser?.blockedReason || currentUser?.blocked_reason || '';
  const customerIsBlocked = currentUser?.blocked === true
    || currentUser?.isBlocked === true
    || currentUser?.is_blocked === true;
  const hasActivePaymentRequest = currentUser?.requiresNoShowPayment === true
    || currentUser?.requires_no_show_payment === true
    || Number(currentUser?.noShowPaymentAmount ?? currentUser?.no_show_payment_amount ?? 0) > 0;
  const paymentAmount = Number(currentUser?.noShowPaymentAmount ?? currentUser?.no_show_payment_amount ?? 0);
  const paymentReason = currentUser?.noShowPaymentReason || currentUser?.no_show_payment_reason || '';
  const blockedMessage = blockedReason.includes('אי הגעה לתור')
    ? 'החשבון שלך נחסם לקביעת תורים עקב אי הגעה לתור. להסרת החסימה פנה לעסק.'
    : (blockedReason
      ? `החשבון שלך חסום לקביעת תורים. סיבה: ${blockedReason}. פנה לעסק.`
      : 'החשבון שלך חסום לקביעת תורים. פנה לעסק.');

  if (customerIsBlocked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6 page-transition" dir="rtl">
        <div className="glass rounded-3xl p-6 text-center max-w-sm">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h2 className="text-xl font-black mb-2">לא ניתן לקבוע תור</h2>
          <p className="text-muted-foreground text-sm mb-5">
            {blockedMessage}
          </p>
          <p className="hidden">
            {currentUser.blockedReason || currentUser.blocked_reason
              ? `החשבון שלך חסום לקביעת תורים. סיבה: ${currentUser.blockedReason || currentUser.blocked_reason}. פנה לעסק.`
              : 'החשבון שלך חסום לקביעת תורים. פנה לעסק.'}
          </p>
          <GoldButton onClick={() => navigate('/')} className="w-full">חזרה לדף הבית</GoldButton>
        </div>
      </div>
    );
  }

  if (hasActivePaymentRequest) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6 page-transition" dir="rtl">
        <div className="glass rounded-3xl p-6 text-center max-w-sm">
          <AlertCircle className="w-12 h-12 text-yellow-300 mx-auto mb-3" />
          <h2 className="text-xl font-black mb-2">דרישת תשלום פעילה</h2>
          <p className="text-muted-foreground text-sm mb-3">
            לא ניתן להזמין תור עד להסדרת דרישת התשלום מול הספר.
          </p>
          {paymentAmount > 0 && (
            <p className="text-primary font-black mb-2">סכום להסדרה: ₪{paymentAmount}</p>
          )}
          {paymentReason && (
            <p className="text-muted-foreground text-xs leading-5 mb-5">{paymentReason}</p>
          )}
          <GoldButton onClick={() => navigate('/profile')} className="w-full">צפה בסטטוס החשבון</GoldButton>
        </div>
      </div>
    );
  }

  if (activeAppointment && !replacementMode) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6 page-transition" dir="rtl">
        <div className="glass rounded-3xl p-6 text-center max-w-sm">
          <Calendar className="w-12 h-12 text-primary mx-auto mb-3" />
          <h2 className="text-xl font-black mb-2">כבר יש לך תור פעיל</h2>
          <p className="text-muted-foreground text-sm mb-4">
            כבר יש לך תור פעיל. ניתן לבטל את התור הקיים ולקבוע תור חדש.
          </p>
          <div className="dark-card rounded-2xl p-4 text-right mb-5 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">תאריך</span>
              <span className="font-bold">{activeAppointment.date || '-'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">שעה</span>
              <span className="font-bold">{activeAppointment.startTime || activeAppointment.time || '-'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">שירות</span>
              <span className="font-bold">{activeAppointment.serviceName || activeAppointment.service_name || '-'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">סטטוס</span>
              <span className="font-bold text-primary">{BOOKING_STATUS_LABELS[activeAppointment.status] || activeAppointment.status}</span>
            </div>
          </div>
          <div className="space-y-2">
            <button
              onClick={() => navigate('/appointments')}
              className="w-full py-3 rounded-xl glass font-bold text-sm"
            >
              השאר את התור הקיים
            </button>
            <GoldButton
              onClick={() => {
                setReplacementMode(true);
                setSelectedDate(null);
                setSelectedTime(null);
                setSelectedSlot(null);
                setBookingError('');
                setStep(1);
              }}
              className="w-full"
            >
              בטל וקבע חדש
            </GoldButton>
          </div>
        </div>
      </div>
    );
  }

  const serviceList = services.filter(s => s.is_active !== false);

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
        </div>
        <div className="flex gap-1.5 mt-3">
          {[1,2,3].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-all duration-300 ${s <= step ? 'gold-gradient' : 'bg-secondary'}`} />
          ))}
        </div>
      </div>

      <div className="px-4 py-6">
        {replacementMode && activeAppointment && (
          <div className="glass-gold rounded-2xl p-3 mb-4 text-sm text-primary font-bold text-center">
            התור הקיים יבוטל רק לאחר שהתור החדש יישמר בהצלחה.
          </div>
        )}
        <AnimatePresence mode="wait">

          {/* ── STEP 1: Barber + Service ── */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <h2 className="text-xl font-black mb-1">בחירת שירות</h2>
              <p className="text-muted-foreground text-sm mb-5">שלב 1 מתוך 3</p>

              {/* Barber */}
              {barbers.length > 1 && (
                <div className="glass rounded-2xl p-4 mb-5">
                  <BarberSelector
                    barbers={barbers}
                    selectedBarber={selectedBarber}
                    includeAllOption
                    onSelect={(barber) => {
                      setSelectedBarber(barber);
                      setSelectedDate(null);
                      setSelectedTime(null);
                      setSelectedSlot(null);
                      setWaitingListOpen(false);
                      setWaitingListMessage('');
                    }}
                  />
                </div>
              )}
              {barbers.length === 0 && (
                <div className="glass rounded-2xl p-4 mb-5 text-center text-sm text-muted-foreground">
                  אין כרגע ספר פעיל לקביעת תור.
                </div>
              )}

              {/* Services by category */}
              <div className="mb-4">
                <p className="text-xs text-muted-foreground font-semibold mb-2 px-1">תספורות</p>
                <div className="space-y-2">
                  {serviceList.filter(s => s.name !== 'עיצוב זקן' && s.name !== 'חבילת פרימיום').map(service => (
                    <ServiceCard key={service.id} service={service} selected={selectedService?.id === service.id}
                      onSelect={(s) => { setSelectedService(s); setSelectedTime(null); setSelectedSlot(null); setWaitingListOpen(false); setWaitingListMessage(''); }} />
                  ))}
                </div>
              </div>
              <div className="mb-4">
                <p className="text-xs text-muted-foreground font-semibold mb-2 px-1">עיצוב זקן</p>
                <div className="space-y-2">
                  {serviceList.filter(s => s.name === 'עיצוב זקן').map(service => (
                    <ServiceCard key={service.id} service={service} selected={selectedService?.id === service.id}
                      onSelect={(s) => { setSelectedService(s); setSelectedTime(null); setSelectedSlot(null); setWaitingListOpen(false); setWaitingListMessage(''); }} />
                  ))}
                </div>
              </div>
              <div className="mb-6">
                <p className="text-xs text-muted-foreground font-semibold mb-2 px-1">חבילות</p>
                <div className="space-y-2">
                  {serviceList.filter(s => s.name === 'חבילת פרימיום').map(service => (
                    <ServiceCard key={service.id} service={service} selected={selectedService?.id === service.id}
                      onSelect={(s) => { setSelectedService(s); setSelectedTime(null); setSelectedSlot(null); setWaitingListOpen(false); setWaitingListMessage(''); }} />
                  ))}
                </div>
              </div>

              {serviceList.length === 0 && (
                <div className="glass rounded-2xl p-4 mb-5 text-center text-sm text-muted-foreground">
                  אין כרגע שירותים פעילים להזמנה.
                </div>
              )}

              {selectedService && selectedBarber && (
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
                availabilityMode={bookingSettings?.availabilityMode}
                manualReleases={upcomingSlotReleases}
                selectedBarberId={selectedSpecificBarberId}
                activeBarberIds={activeBarberIds}
                onSelect={(d) => { setSelectedDate(d); setSelectedTime(null); setSelectedSlot(null); setSelectedTimeGroup(null); setWaitingListOpen(false); setWaitingListMessage(''); }}
              />

              {/* Time selection */}
              {selectedDate && !isDateBlocked && (
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
                  <h3 className="font-black mb-1 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" /> מתי תרצה להגיע?
                  </h3>
                  <p className="text-xs text-muted-foreground mb-4">ניתן לבחור יותר מאפשרות אחת!</p>

                  {availableSlots.length === 0 ? (
                    <>
                      <div className="glass rounded-2xl p-6 text-center">
                        <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-muted-foreground text-sm">{emptyAvailabilityMessage}</p>
                      </div>
                      {waitingListPanel}
                    </>
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
                            <button onClick={() => { setSelectedTimeGroup(null); setSelectedTime(null); setSelectedSlot(null); }} className="flex items-center gap-1 text-muted-foreground text-sm">
                              <ArrowRight className="w-4 h-4" /> חזרה לבחירת זמן
                            </button>
                            <span className="text-sm font-bold">
                              {TIME_GROUPS.find(g => g.key === selectedTimeGroup)?.emoji} {TIME_GROUPS.find(g => g.key === selectedTimeGroup)?.label}
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {(slotGroups[selectedTimeGroup] || []).map(slot => (
                              <motion.button
                                key={slot.id}
                                whileTap={{ scale: 0.92 }}
                                onClick={() => {
                                  setSelectedTime(slot.time);
                                  setSelectedSlot(slot);
                                }}
                                className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                                  selectedSlot?.id === slot.id ? 'gold-gradient text-black' : 'glass hover:border-primary/50'
                                }`}
                              >
                                <span className="block">{slot.time}</span>
                                {isAllBarbersMode && (
                                  <span className="block w-full truncate px-1 text-[10px] font-medium opacity-80 leading-4">{slot.barberName}</span>
                                )}
                              </motion.button>
                            ))}
                          </div>
                        </div>
                      )}
                      {!selectedTime && waitingListPanel}
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

              {selectedDate && selectedTime && selectedSlot && (
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
                  { label: 'ספר', value: selectedAppointmentBarberName },
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
              {(currentUser?.requiresNoShowPayment || currentUser?.noShowPaymentAmount > 0) && (
                <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-3 mb-4 text-sm">
                  <p className="font-bold text-yellow-100 mb-1">נדרש תיאום תשלום לפני התור</p>
                  <p className="text-muted-foreground leading-6">
                    לפי מדיניות העסק, נדרש תשלום של 50% ממחיר התספורת עקב ביטול ללא הודעה מראש / אי הגעה.
                    אין גבייה באפליקציה כרגע, יש ליצור קשר עם הספר להסדרת התשלום.
                  </p>
                  {currentUser?.noShowPaymentAmount > 0 && (
                    <p className="text-primary font-black mt-2">סכום: ₪{currentUser.noShowPaymentAmount}</p>
                  )}
                </div>
              )}
              <div className="glass rounded-2xl p-4 mb-4">
                <h3 className="font-bold text-sm mb-2">מדיניות העסק</h3>
                <p className="text-xs text-muted-foreground whitespace-pre-line leading-6">
                  {businessSettings?.bookingPolicyText || `חברים שימו ❤️ ממליץ להקדים את התור עקב מצוקת חניות באזור!
*יש לבחור תור לתספורת במידה ובחרת עם גזירות.
*איחורים מעל 10 דקות לא יתקבלו.
*במקרה של ביטולים ללא הודעה מראש יידרש 50 אחוז ממחיר התספורת בתור הבא.`}
                </p>
                <label className="mt-3 flex items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={policyAccepted}
                    onChange={event => {
                      setPolicyAccepted(event.target.checked);
                      if (event.target.checked) setBookingError('');
                    }}
                    className="accent-primary w-5 h-5"
                  />
                  אני מאשר/ת את מדיניות העסק
                </label>
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
                {loading ? 'מאשר...' : currentUser ? (replacementMode ? 'בטל וקבע תור חדש' : 'אשר תור') : 'התחבר ואשר'}
              </GoldButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}
