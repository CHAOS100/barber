import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check, X, UserX, Plus, Edit3, Calendar, CalendarPlus, Clock, Scissors, Save, Trash2, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import {
  createAdminAppointment,
  deleteAppointment,
  updateAdminAppointment,
} from '@/lib/appointmentsFirestore';
import {
  appointmentStatusMatchesFilter,
  getEffectiveAppointmentStatus,
  isAppointmentActiveForSchedule,
  isAppointmentHistoryForSchedule,
  localDateToString,
} from '@/lib/appointmentStatus';
import { useAdminAppointmentsRealtime } from '@/hooks/useAppointmentsRealtime';
import { toast } from '@/components/ui/use-toast';
import { useAllBarbersRealtime, useAllServicesRealtime } from '@/hooks/useBookingData';
import { DATA_LOAD_ERROR_MESSAGE, getUserFacingErrorMessage } from '@/lib/userFacingErrors';
import { getCancellationReasonLabel } from '@/lib/labels';
import { useCustomerProfilesRealtime } from '@/hooks/useCustomerProfilesRealtime';
import { normalizeIsraeliPhoneNumber } from '@/lib/firebase';
import { formatILS } from '@/lib/formatters';
import { downloadAppointmentsIcs, isCalendarExportableAppointment } from '@/lib/calendarExport';
import { getBookingRejectionMessage } from '@/lib/bookingErrors';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ModalActions, ModalBody, ModalHeader, ModalShell } from '@/components/ui/ModalShell';

const STATUS_CONFIG = {
  pending:               { label: 'ממתין',              color: 'text-yellow-400 bg-yellow-400/20',   pill: 'status-pill--warning' },
  approved:              { label: 'מאושר',              color: 'text-green-400 bg-green-400/20',     pill: 'status-pill--success' },
  confirmed:             { label: 'מאושר',              color: 'text-green-400 bg-green-400/20',     pill: 'status-pill--success' },
  completed:             { label: 'הושלם',              color: 'text-primary bg-primary/20',         pill: 'status-pill--accent' },
  completed_auto:        { label: 'הושלם — התספורת בוצעה', color: 'text-primary bg-primary/20',         pill: 'status-pill--accent' },
  cancelled:             { label: 'בוטל',               color: 'text-red-400 bg-red-400/20',         pill: 'status-pill--danger' },
  cancelled_by_admin:    { label: 'בוטל מצד הספר',      color: 'text-red-400 bg-red-400/20',         pill: 'status-pill--danger' },
  cancelled_by_customer: { label: 'בוטל מצד הלקוח',    color: 'text-orange-400 bg-orange-400/20',   pill: 'status-pill--warning' },
  rejected:              { label: 'נדחה',               color: 'text-red-400 bg-red-400/20',         pill: 'status-pill--danger' },
  no_show:               { label: 'לא הגיע',            color: 'text-orange-400 bg-orange-400/20',   pill: 'status-pill--warning' },
};

const RANGE_FILTERS = [
  { value: 'all_time', label: 'כל התורים' },
  { value: 'today', label: 'היום' },
  { value: 'future', label: 'עתידיים' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'כל הסטטוסים' },
  { value: 'pending', label: STATUS_CONFIG.pending.label },
  { value: 'confirmed', label: STATUS_CONFIG.confirmed.label },
  { value: 'completed', label: STATUS_CONFIG.completed.label },
  { value: 'cancelled', label: STATUS_CONFIG.cancelled.label },
  { value: 'no_show', label: STATUS_CONFIG.no_show.label },
  { value: 'rejected', label: STATUS_CONFIG.rejected.label },
];

const STATUS_EDIT_OPTIONS = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];

// Generate time slots for edit
const TIME_SLOTS = [];
for (let h = 6; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    TIME_SLOTS.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
  }
}

function EditAppointmentSheet({ appt, services, barbers, customers, onSave, onClose, isSaving, error }) {
  const isNew = appt.id === '__new__';
  const [form, setForm] = useState({
    customer_id: appt.customer_id || appt.customerId || '',
    customer_name: appt.customer_name || '',
    customer_phone: appt.customer_phone || '',
    service_name: appt.service_name || '',
    service_id: appt.service_id || '',
    service_price: appt.service_price || 0,
    service_duration: appt.service_duration || 30,
    date: appt.date || '',
    time: appt.time || '',
    status: appt.status || 'pending',
    barber_id: appt.barber_id || '',
    barber_name: appt.barber_name || '',
    paid: appt.paid === true,
    notes: appt.notes || '',
    admin_notes: appt.admin_notes || '',
  });
  const [customerSearch, setCustomerSearch] = useState('');
  const filteredCustomers = customers
    .filter((customer) => {
      const search = customerSearch.trim().toLowerCase();
      if (!search) return true;
      return `${customer.name || ''} ${customer.phoneNumber || ''} ${customer.phone || ''}`.toLowerCase().includes(search);
    })
    .slice(0, 25);

  const handleCustomerSelect = (customerId) => {
    const customer = customers.find((item) => item.id === customerId);
    if (!customer) {
      setForm(f => ({ ...f, customer_id: '' }));
      return;
    }
    setForm(f => ({
      ...f,
      customer_id: customer.id,
      customer_name: customer.name || `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
      customer_phone: customer.phoneNumber || customer.phone || '',
    }));
  };

  const handleServiceChange = (name) => {
    const svc = services.find(s => s.name === name);
    setForm(f => ({
      ...f,
      service_name: name,
      service_id: svc?.id || f.service_id,
      service_price: svc?.price || f.service_price,
      service_duration: svc?.duration || f.service_duration,
    }));
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      label={isNew ? 'תור חדש' : 'עריכת תור'}
      closeOnBackdrop={false}
      closeOnEscape={false}
      busy={isSaving}
      className="dark-card max-w-sm rounded-3xl"
    >
        <ModalHeader title={isNew ? 'תור חדש' : 'עריכת תור'} onClose={onClose} busy={isSaving} />

        {/* Scrollable form body */}
        <ModalBody>
          <div className="space-y-4 pb-2">
            {/* Customer selection */}
            <div className="glass-gold rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs text-muted-foreground font-semibold">שיוך לקוח</label>
                <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                  form.customer_id ? 'bg-primary/15 text-primary' : 'bg-yellow-400/10 text-yellow-300'
                }`}>
                  {form.customer_id ? 'לקוח רשום' : 'לקוח לפי טלפון'}
                </span>
              </div>
              <input
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                placeholder="חיפוש לקוח רשום לפי שם או טלפון"
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-right focus:outline-none focus:border-primary"
                dir="rtl"
              />
              <select
                value={form.customer_id}
                onChange={e => handleCustomerSelect(e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                dir="rtl"
              >
                <option value="">לקוח לא רשום / הזמנה לפי טלפון</option>
                {filteredCustomers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name || 'לקוח'} — {customer.phoneNumber || customer.phone || ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Customer name */}
            <div>
              <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">שם לקוח</label>
              <input
                value={form.customer_name}
                onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-right focus:outline-none focus:border-primary"
                dir="rtl"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">טלפון</label>
              <input
                value={form.customer_phone}
                onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-left focus:outline-none focus:border-primary"
                dir="ltr"
                inputMode="tel"
                autoComplete="tel"
              />
            </div>

            {/* Service */}
            <div>
              <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">שירות</label>
              <select
                value={form.service_name}
                onChange={e => handleServiceChange(e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary appearance-none cursor-pointer"
                dir="rtl"
              >
                {services.map(s => (
                  <option key={s.id} value={s.name}>{s.name} — {formatILS(s.price)}</option>
                ))}
              </select>
            </div>

            {/* Price & Duration */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">מחיר (₪)</label>
                <input
                  type="number"
                  value={form.service_price}
                  onChange={e => setForm(f => ({ ...f, service_price: Number(e.target.value) }))}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">משך (דקות)</label>
                <input
                  type="number"
                  value={form.service_duration}
                  onChange={e => setForm(f => ({ ...f, service_duration: Number(e.target.value) }))}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">ספר</label>
              <select
                value={form.barber_id}
                onChange={e => {
                  const barber = barbers.find(item => item.id === e.target.value);
                  setForm(f => ({ ...f, barber_id: barber?.id || '', barber_name: barber?.name || '' }));
                }}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">בחר ספר</option>
                {barbers.filter(barber => !barber.archived).map(barber => (
                  <option key={barber.id} value={barber.id}>{barber.name}{!barber.is_active ? ' (לא פעיל)' : ''}</option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">תאריך</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              />
            </div>

            {/* Time */}
            <div>
              <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">שעה</label>
              <select
                value={form.time}
                onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary appearance-none cursor-pointer"
              >
                {TIME_SLOTS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">סטטוס</label>
              <div className="grid grid-cols-3 gap-2">
                {STATUS_EDIT_OPTIONS.map((key) => {
                  const cfg = STATUS_CONFIG[key];
                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() => setForm(f => ({ ...f, status: key }))}
                      className={`py-2 rounded-xl text-xs font-bold transition-all ${
                        form.status === key ? cfg.color : 'glass text-muted-foreground'
                      }`}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex items-center justify-between glass rounded-xl px-3 py-2.5">
              <span className="text-sm font-bold">שולם</span>
              <input
                type="checkbox"
                checked={form.paid}
                onChange={e => setForm(f => ({ ...f, paid: e.target.checked }))}
                className="accent-primary w-5 h-5"
              />
            </label>

            <div>
              <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">הערות לקוח</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-right focus:outline-none focus:border-primary resize-none"
                dir="rtl"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">הערות מנהל</label>
              <textarea
                value={form.admin_notes}
                onChange={e => setForm(f => ({ ...f, admin_notes: e.target.value }))}
                rows={2}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-right focus:outline-none focus:border-primary resize-none"
                dir="rtl"
              />
            </div>
          </div>
        </ModalBody>

        {/* Error banner + action buttons — always visible, never scrolls */}
        <ModalActions>
          {error && (
            <div className="banner-error mb-3">
              {getBookingRejectionMessage(error)}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={isSaving} className="flex-1 py-3 rounded-2xl glass text-muted-foreground font-bold text-sm disabled:cursor-wait disabled:opacity-50">
              ביטול
            </button>
            <button
              type="button"
              onClick={() => onSave(appt.id, form)}
              disabled={isSaving}
              className="flex-1 py-3 rounded-2xl gold-gradient text-black font-black text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? (isNew ? 'יוצר...' : 'שומר...') : (isNew ? 'צור תור' : 'שמור')}
            </button>
          </div>
        </ModalActions>
    </ModalShell>
  );
}

export default function AdminAppointments() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('active');
  const [rangeFilter, setRangeFilter] = useState('all_time');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editAppt, setEditAppt] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [noShowAppt, setNoShowAppt] = useState(null);
  const [noShowAction, setNoShowAction] = useState('warning');
  const [cancelAppt, setCancelAppt] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [deleteAppt, setDeleteAppt] = useState(null);

  // Per-appointment-per-action loading key: "{appointmentId}:{action}"
  // e.g. "appt123:approve", "appt123:cancel", "appt123:delete", "appt123:paid"
  const [loadingAction, setLoadingAction] = useState(null);

  const clearAction = () => { setLoadingAction(null); };
  const isActionLoading = (key) => loadingAction === key;

  const { appointments, error: appointmentsError } = useAdminAppointmentsRealtime();
  const { data: services, error: servicesError } = useAllServicesRealtime();
  const { data: barbers, error: barbersError } = useAllBarbersRealtime();
  const { customers, error: customersError } = useCustomerProfilesRealtime();

  const updateMutation = useMutation({
    mutationFn: (/** @type {any} */ { id, data }) => updateAdminAppointment(id, data),
    onSuccess: () => {
      setEditAppt(null);
      setNoShowAppt(null);
      setCancelAppt(null);
      setCancelReason('');
      clearAction();
      toast({ title: 'התור עודכן', description: 'השינוי נשמר ומופיע בזמן אמת.' });
    },
    onError: (error) => {
      clearAction();
      toast({ variant: 'destructive', title: 'עדכון התור נכשל', description: getUserFacingErrorMessage(error) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteAppointment(id),
    onSuccess: () => {
      setDeleteAppt(null);
      clearAction();
      toast({ title: 'התור הוסר מהניהול', description: 'הרשומה נשמרה להיסטוריה והזמן התפנה להזמנה מחדש.' });
    },
    onError: (error) => {
      clearAction();
      toast({ variant: 'destructive', title: 'מחיקת התור נכשלה', description: getUserFacingErrorMessage(error) });
    },
  });

  const createMutation = useMutation({
    mutationFn: (data) => createAdminAppointment(data),
    onSuccess: () => {
      setShowNewForm(false);
      clearAction();
      toast({ title: 'התור נוסף', description: 'התור נשמר בהצלחה.' });
    },
    onError: (error) => {
      clearAction();
      toast({ variant: 'destructive', title: 'יצירת התור נכשלה', description: getUserFacingErrorMessage(error) });
    },
  });

  const mutationError = updateMutation.error || deleteMutation.error || createMutation.error;

  const handleQuickAction = useCallback((actionKey, mutationCall) => {
    if (loadingAction === actionKey) return;
    setLoadingAction(actionKey);
    mutationCall();
  }, [loadingAction]);

  const now = new Date();
  const today = localDateToString(now);
  const activeCount = appointments.filter(a => isAppointmentActiveForSchedule(a, now)).length;
  const historyCount = appointments.filter(a => isAppointmentHistoryForSchedule(a, now)).length;
  const filtered = [...appointments]
    .sort((left, right) =>
      `${left.date || ''} ${left.time || left.startTime || ''}`.localeCompare(
        `${right.date || ''} ${right.time || right.startTime || ''}`,
      ))
    .filter((appointment) => {
      if (viewMode === 'active' && !isAppointmentActiveForSchedule(appointment, now)) return false;
      if (viewMode === 'history' && !isAppointmentHistoryForSchedule(appointment, now)) return false;
      const appointmentDate = appointment.date || '';
      const matchesRange = rangeFilter === 'all_time'
        || (rangeFilter === 'today' && appointmentDate === today)
        || (rangeFilter === 'future' && appointmentDate > today);
      const matchesStatus = appointmentStatusMatchesFilter(appointment, statusFilter, now);
      return matchesRange && matchesStatus;
    });
  const exportableAppointments = filtered.filter(isCalendarExportableAppointment);

  const handleExportAppointment = (appointment) => {
    const exportedCount = downloadAppointmentsIcs([appointment], `ost-barber-${appointment.id}.ics`);
    toast({
      title: exportedCount ? 'קובץ יומן נוצר' : 'אין תור מתאים לייצוא',
      description: exportedCount
        ? 'פתח את הקובץ במכשיר כדי להוסיף את התור ליומן.'
        : 'ניתן לייצא רק תורים עתידיים מאושרים.',
    });
  };

  const handleExportVisibleAppointments = () => {
    const exportedCount = downloadAppointmentsIcs(exportableAppointments, 'ost-barber-upcoming.ics');
    toast({
      title: exportedCount ? 'קובץ יומן נוצר' : 'אין תורים לייצוא',
      description: exportedCount
        ? `${exportedCount} תורים עתידיים מאושרים מוכנים להוספה ליומן.`
        : 'אין ברשימה הנוכחית תורים עתידיים מאושרים.',
    });
  };

  const BLANK_APPT = {
    id: '__new__',
    customer_id: '',
    customer_name: '',
    customer_phone: '',
    service_name: services[0]?.name || '',
    service_id: services[0]?.id || '',
    service_price: services[0]?.price || 0,
    service_duration: services[0]?.duration || 30,
    date: localDateToString(),
    time: '10:00',
    status: 'confirmed',
    barber_id: barbers.find(barber => barber.is_active && !barber.archived)?.id || '',
    barber_name: barbers.find(barber => barber.is_active && !barber.archived)?.name || '',
    paid: false,
    notes: '',
    admin_notes: '',
  };

  const handleSave = (id, form) => {
    let normalizedPhone = form.customer_phone;
    if (normalizedPhone) {
      try {
        normalizedPhone = normalizeIsraeliPhoneNumber(normalizedPhone);
      } catch {
        toast({
          variant: 'destructive',
          title: 'מספר טלפון לא תקין',
          description: 'יש להזין מספר טלפון ישראלי תקין עבור הלקוח.',
        });
        return;
      }
    }
    const data = { ...form, customer_phone: normalizedPhone };
    if (id === '__new__') {
      createMutation.mutate(data);
    } else {
      updateMutation.mutate({ id, data });
    }
  };

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky-top-safe z-[var(--z-sticky-nav)] glass border-b border-white/10 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/admin')} className="icon-btn press-scale -mr-2" aria-label="חזרה לניהול">
          <ArrowRight className="w-6 h-6" />
        </button>
        <div>
          <h1 className="font-black text-lg">ניהול תורים</h1>
          <p className="text-muted-foreground text-xs">{filtered.length} תורים</p>
        </div>
        <div className="mr-auto flex items-center gap-2">
          <button
            onClick={handleExportVisibleAppointments}
            disabled={exportableAppointments.length === 0}
            title="עדכן לוח שנה"
            className="glass px-3 py-2.5 rounded-xl text-primary text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            <CalendarPlus className="w-4 h-4" />
            <span className="hidden sm:inline">עדכן לוח שנה</span>
          </button>
          <button
            onClick={() => setShowNewForm(true)}
            className="gold-gradient p-2.5 rounded-xl"
          >
            <Plus className="w-4 h-4 text-black" />
          </button>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex gap-2 px-4 pt-3 pb-1">
        {[
          { key: 'active', label: 'פעילים', count: activeCount },
          { key: 'history', label: 'היסטוריה', count: historyCount },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setViewMode(tab.key)}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all ${viewMode === tab.key ? 'gold-gradient text-black' : 'glass text-muted-foreground'}`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="px-4 py-2 space-y-2">
        <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {RANGE_FILTERS.map((option) => (
            <button
              key={option.value}
              onClick={() => setRangeFilter(option.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-bold transition-all ${
                rangeFilter === option.value ? 'gold-gradient text-black' : 'glass text-muted-foreground'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {STATUS_FILTERS.map((option) => (
            <button
              key={option.value}
              onClick={() => setStatusFilter(option.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-bold transition-all ${
                statusFilter === option.value ? 'gold-gradient text-black' : 'glass text-muted-foreground'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {appointmentsError && (
        <div className="banner-error mx-4 mb-3">
          {DATA_LOAD_ERROR_MESSAGE}
        </div>
      )}
      {(servicesError || barbersError || customersError) && (
        <div className="banner-error mx-4 mb-3">
          {DATA_LOAD_ERROR_MESSAGE}
        </div>
      )}
      {mutationError && (
        <div className="banner-error mx-4 mb-3">
          {/** @type {any} */ (mutationError).code === 'functions/already-exists'
            ? 'הפעולה נחסמה כי התור חופף לתור קיים של אותו ספר.'
            : 'הפעולה נכשלה. יש לוודא שנבחרו ספר ושירות תקינים ולנסות שוב.'}
        </div>
      )}

      <div className="px-4 space-y-2 pb-6">
        {filtered.map((appt, i) => {
          const effectiveStatus = getEffectiveAppointmentStatus(appt, now);
          const sc = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.pending;
          const isActive = isAppointmentActiveForSchedule(appt, now);
          const appointmentBusy = Boolean(loadingAction?.startsWith(`${appt.id}:`));
          return (
            <motion.div
              key={appt.id || i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="dark-card rounded-2xl p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 gold-gradient rounded-full flex items-center justify-center text-black font-bold text-sm flex-shrink-0">
                    {appt.customer_name?.[0] || '?'}
                  </div>
                  <div>
                    <div className="font-bold text-sm">{appt.customer_name}</div>
                    <div className="text-muted-foreground text-xs">{appt.customer_phone}</div>
                    <div className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      appt.customerId || appt.customer_id
                        ? 'bg-primary/15 text-primary'
                        : 'bg-yellow-400/10 text-yellow-300'
                    }`}>
                      {appt.customerId || appt.customer_id ? 'לקוח רשום' : 'לקוח לפי טלפון'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`status-pill ${sc.pill}`}>{sc.label}</span>
                  <button
                    onClick={() => setEditAppt(appt)}
                    className="glass p-2 rounded-xl"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-primary" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Scissors className="w-3.5 h-3.5" />
                  <span>{appt.service_name}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{appt.date}</span>
                  <Clock className="w-3.5 h-3.5 mr-1" />
                  <span>{appt.time}</span>
                </div>
              </div>
              {appt.service_price > 0 && (
                <div className="flex items-center justify-between mt-2">
                  <div className="text-primary font-black">{formatILS(appt.service_price)}</div>
                  {appt.admin_notes && (
                    <span className="text-muted-foreground text-xs truncate max-w-[60%]">📝 {appt.admin_notes}</span>
                  )}
                </div>
              )}
              <div className="mt-1 text-xs text-muted-foreground">
                {appt.barber_name || 'ללא ספר'} • {appt.service_duration || 30} דקות • {appt.paid ? 'שולם' : 'לא שולם'}
              </div>
              {appt.status === 'cancelled' && appt.cancellationReason && (
                <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-200">
                  <span className="font-bold">סיבת ביטול: </span>
                  {getCancellationReasonLabel(appt.cancellationReason)}
                </div>
              )}

              {/* Quick action buttons */}
              <div className="flex gap-1.5 mt-3">
                {isActive && appt.status === 'pending' && (() => {
                  const key = `${appt.id}:approve`;
                  const loading = isActionLoading(key);
                  return (
                    <button
                      onClick={() => handleQuickAction(key, () => updateMutation.mutate({ id: appt.id, data: { status: 'confirmed' } }))}
                      disabled={appointmentBusy}
                      className="flex-1 py-1.5 rounded-xl bg-green-500/15 text-green-400 text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      {loading ? 'מאשר...' : 'אשר'}
                    </button>
                  );
                })()}
                {isActive && (appt.status === 'pending' || appt.status === 'confirmed') && (
                  <>
                    <button
                      onClick={() => { setNoShowAppt(appt); setNoShowAction('warning'); }}
                      disabled={appointmentBusy}
                      className="flex-1 py-1.5 rounded-xl bg-orange-500/15 text-orange-400 text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      <UserX className="w-3 h-3" /> לא הגיע
                    </button>
                    <button
                      onClick={() => { setCancelAppt(appt); setCancelReason(''); }}
                      disabled={appointmentBusy}
                      className="flex-1 py-1.5 rounded-xl bg-red-500/15 text-red-400 text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      <X className="w-3 h-3" /> בטל
                    </button>
                  </>
                )}
                {isActive && appt.status === 'confirmed' && (() => {
                  const key = `${appt.id}:complete`;
                  const loading = isActionLoading(key);
                  return (
                    <button
                      onClick={() => handleQuickAction(key, () => updateMutation.mutate({ id: appt.id, data: { status: 'completed' } }))}
                      disabled={appointmentBusy}
                      className="flex-1 py-1.5 rounded-xl bg-primary/15 text-primary text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      {loading ? 'שומר...' : 'הושלם'}
                    </button>
                  );
                })()}
                {!appt.paid && (() => {
                  const key = `${appt.id}:paid`;
                  const loading = isActionLoading(key);
                  return (
                    <button
                      onClick={() => handleQuickAction(key, () => updateMutation.mutate({ id: appt.id, data: { paid: true } }))}
                      disabled={appointmentBusy}
                      className="flex-1 py-1.5 rounded-xl bg-primary/15 text-primary text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      {loading ? 'מסמן...' : 'סמן שולם'}
                    </button>
                  );
                })()}
                {isCalendarExportableAppointment(appt) && (
                  <button
                    type="button"
                    onClick={() => handleExportAppointment(appt)}
                    className="flex-1 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-bold flex items-center justify-center gap-1"
                  >
                    <CalendarPlus className="w-3 h-3" />
                    הוסף ליומן
                  </button>
                )}
                {(() => {
                  const key = `${appt.id}:delete`;
                  const loading = isActionLoading(key);
                  return (
                    <button
                      onClick={() => setDeleteAppt(appt)}
                      disabled={appointmentBusy}
                      className="py-1.5 px-3 rounded-xl bg-red-500/10 text-red-400 text-xs font-bold flex items-center justify-center disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    </button>
                  );
                })()}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Edit Sheet */}
        {editAppt && (
          <EditAppointmentSheet
            appt={editAppt}
            services={services}
            barbers={barbers}
            customers={customers}
            onSave={handleSave}
            onClose={() => setEditAppt(null)}
            isSaving={updateMutation.isPending}
            error={updateMutation.error}
          />
        )}
        {showNewForm && (
          <EditAppointmentSheet
            appt={BLANK_APPT}
            services={services}
            barbers={barbers}
            customers={customers}
            onSave={handleSave}
            onClose={() => setShowNewForm(false)}
            isSaving={createMutation.isPending}
            error={createMutation.error}
          />
        )}
        <ModalShell
          open={Boolean(cancelAppt)}
          onClose={() => { setCancelAppt(null); setCancelReason(''); }}
          label="ביטול תור על ידי מנהל"
          closeOnBackdrop={false}
          closeOnEscape={false}
          busy={updateMutation.isPending}
          level="confirmation"
          className="dark-card max-w-sm rounded-3xl"
        >
          {cancelAppt && (
            <>
              <div className="px-5 pt-5 pb-3 flex-shrink-0">
                <h3 className="font-black text-lg mb-1">ביטול תור</h3>
                <p className="text-muted-foreground text-sm">
                  כתוב סיבת ביטול שתופיע בהיסטוריית התור ללקוח ולניהול.
                </p>
              </div>
              <ModalBody>
                <textarea
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  rows={4}
                  placeholder="לדוגמה: הלקוח ביקש לבטל / שינוי בלו״ז העסק..."
                  className="w-full bg-secondary border border-border rounded-2xl px-3 py-3 text-sm resize-none focus:outline-none focus:border-primary"
                  dir="rtl"
                />
              </ModalBody>
              <ModalActions className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setCancelAppt(null); setCancelReason(''); }}
                  disabled={updateMutation.isPending}
                  className="flex-1 glass py-3 rounded-xl font-bold disabled:cursor-wait disabled:opacity-50"
                >
                  חזרה
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoadingAction(`${cancelAppt.id}:cancel`);
                    updateMutation.mutate({
                      id: cancelAppt.id,
                      data: {
                        status: 'cancelled',
                        cancellationReason: cancelReason.trim() || 'admin_cancelled',
                      },
                    });
                  }}
                  disabled={updateMutation.isPending}
                  className="flex-1 bg-red-500 text-white py-3 rounded-xl font-black disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {updateMutation.isPending ? 'מבטל...' : 'בטל תור'}
                </button>
              </ModalActions>
            </>
          )}
        </ModalShell>

        <ModalShell
          open={Boolean(noShowAppt)}
          onClose={() => setNoShowAppt(null)}
          label="סימון אי הגעה"
          closeOnBackdrop={false}
          closeOnEscape={false}
          busy={updateMutation.isPending}
          level="confirmation"
          className="dark-card max-w-sm rounded-3xl"
        >
          {noShowAppt && (
            <>
              <div className="px-5 pt-5 pb-3 flex-shrink-0">
                <h3 className="font-black text-lg mb-1">סימון אי הגעה</h3>
                <p className="text-muted-foreground text-sm">
                  בחר מה לעשות עם הלקוח בעקבות אי הגעה לתור.
                </p>
              </div>
              <ModalBody>
                <div className="space-y-2 pb-1">
                  {[
                    { value: 'warning', label: 'אזהרה בלבד', description: 'הוספת אזהרה לפרופיל הלקוח.' },
                    { value: 'payment_required', label: 'דרוש תשלום 50%', description: 'יסומן שנדרש תשלום לפני ההזמנה הבאה.' },
                    { value: 'block', label: 'חסום לקוח', description: 'מונע מהלקוח לקבוע תורים חדשים.' },
                  ].map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      onClick={() => setNoShowAction(option.value)}
                      className={`w-full rounded-2xl p-3 text-right border transition-all ${
                        noShowAction === option.value
                          ? 'border-primary bg-primary/10'
                          : 'border-white/10 glass'
                      }`}
                    >
                      <span className="block font-bold text-sm">{option.label}</span>
                      <span className="block text-xs text-muted-foreground mt-1">{option.description}</span>
                    </button>
                  ))}
                </div>
              </ModalBody>
              <ModalActions className="flex gap-2">
                <button type="button" onClick={() => setNoShowAppt(null)} disabled={updateMutation.isPending} className="flex-1 glass py-3 rounded-xl font-bold disabled:cursor-wait disabled:opacity-50">
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoadingAction(`${noShowAppt.id}:noshow`);
                    updateMutation.mutate({
                      id: noShowAppt.id,
                      data: { status: 'no_show', noShowAction },
                    });
                  }}
                  disabled={updateMutation.isPending}
                  className="flex-1 gold-gradient text-black py-3 rounded-xl font-black flex items-center justify-center gap-2 disabled:cursor-wait disabled:opacity-50"
                >
                  {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {updateMutation.isPending ? 'שומר...' : 'סמן לא הגיע'}
                </button>
              </ModalActions>
            </>
          )}
        </ModalShell>

        <ConfirmDialog
          open={Boolean(deleteAppt)}
          title="הסרת תור מהניהול"
          description="להסיר את התור מהניהול? הרשומה תישמר בהיסטוריה והזמן יתפנה להזמנה מחדש."
          confirmLabel="הסר תור"
          onClose={() => setDeleteAppt(null)}
          busy={deleteMutation.isPending}
          onConfirm={() => {
            if (!deleteAppt || deleteMutation.isPending) return;
            const key = `${deleteAppt.id}:delete`;
            handleQuickAction(key, () => deleteMutation.mutate(deleteAppt.id));
          }}
        />
    </div>
  );
}
