import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check, X, UserX, Plus, Edit3, Calendar, Clock, Scissors, Save, Trash2, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { localDateToString } from '../../lib/slotEngine';
import {
  createAdminAppointment,
  deleteAppointment,
  updateAdminAppointment,
} from '@/lib/appointmentsFirestore';
import { useAdminAppointmentsRealtime } from '@/hooks/useAppointmentsRealtime';
import { toast } from '@/components/ui/use-toast';
import { useAllBarbersRealtime, useAllServicesRealtime } from '@/hooks/useBookingData';
import { DATA_LOAD_ERROR_MESSAGE, getUserFacingErrorMessage } from '@/lib/userFacingErrors';
import { getCancellationReasonLabel } from '@/lib/labels';
import { useCustomerProfilesRealtime } from '@/hooks/useCustomerProfilesRealtime';
import { normalizeIsraeliPhoneNumber } from '@/lib/firebase';

const STATUS_CONFIG = {
  pending:   { label: 'ממתין',  color: 'text-yellow-400 bg-yellow-400/20', dot: 'bg-yellow-400' },
  approved:  { label: 'מאושר', color: 'text-green-400 bg-green-400/20',   dot: 'bg-green-400' },
  confirmed: { label: 'מאושר', color: 'text-green-400 bg-green-400/20',   dot: 'bg-green-400' },
  completed: { label: 'הושלם', color: 'text-primary bg-primary/20',       dot: 'bg-primary' },
  cancelled: { label: 'בוטל',  color: 'text-red-400 bg-red-400/20',       dot: 'bg-red-400' },
  no_show:   { label: 'לא הגיע', color: 'text-orange-400 bg-orange-400/20', dot: 'bg-orange-400' },
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="keyboard-safe-overlay fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="keyboard-safe-modal dark-card rounded-3xl w-full max-w-sm mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header — always visible, never scrolls */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <h3 className="font-black text-lg">עריכת תור</h3>
          <button onClick={onClose} className="glass p-2 rounded-xl">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable form body */}
        <div className="modal-scroll-body px-5">
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
                  <option key={s.id} value={s.name}>{s.name} — ₪{s.price}</option>
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
        </div>

        {/* Error banner + action buttons — always visible, never scrolls */}
        <div className="modal-actions px-5">
          {error && (
            <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-400 text-sm">
              {error.code === 'functions/already-exists' ? 'התור חופף לתור קיים של אותו ספר.' : 'שמירת התור נכשלה.'}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-3 rounded-2xl glass text-muted-foreground font-bold text-sm">
              ביטול
            </button>
            <button
              onClick={() => onSave(appt.id, form)}
              disabled={isSaving}
              className="flex-1 py-3 rounded-2xl gold-gradient text-black font-black text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? 'שומר...' : 'שמור'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function AdminAppointments() {
  const navigate = useNavigate();
  const [rangeFilter, setRangeFilter] = useState('all_time');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [editAppt, setEditAppt] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [noShowAppt, setNoShowAppt] = useState(null);
  const [noShowAction, setNoShowAction] = useState('warning');
  const [cancelAppt, setCancelAppt] = useState(null);
  const [cancelReason, setCancelReason] = useState('');

  // Per-appointment-per-action loading key: "{appointmentId}:{action}"
  // e.g. "appt123:approve", "appt123:cancel", "appt123:delete", "appt123:paid"
  const [loadingAction, setLoadingAction] = useState(null);
  const loadingRef = useRef(null);

  const setAction = (key) => { loadingAction === null && setLoadingAction(key); loadingRef.current = key; };
  const clearAction = () => { setLoadingAction(null); loadingRef.current = null; };
  const isActionLoading = (key) => loadingAction === key;

  const { appointments, error: appointmentsError } = useAdminAppointmentsRealtime();
  const { data: services, error: servicesError } = useAllServicesRealtime();
  const { data: barbers, error: barbersError } = useAllBarbersRealtime();
  const { customers, error: customersError } = useCustomerProfilesRealtime();

  const updateMutation = useMutation({
    mutationFn: (/** @type {any} */ { id, data }) => updateAdminAppointment(id, data),
    onSuccess: () => {
      setSelectedAppt(null);
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
      setSelectedAppt(null);
      clearAction();
      toast({ title: 'התור נמחק', description: 'הזמן התפנה להזמנה מחדש.' });
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
    if (loadingAction !== null) return; // block if any action in flight
    setLoadingAction(actionKey);
    mutationCall();
  }, [loadingAction]);

  const today = localDateToString();
  const filtered = [...appointments]
    .sort((left, right) =>
      `${left.date || ''} ${left.time || left.startTime || ''}`.localeCompare(
        `${right.date || ''} ${right.time || right.startTime || ''}`,
      ))
    .filter((appointment) => {
      const appointmentDate = appointment.date || '';
      const matchesRange = rangeFilter === 'all_time'
        || (rangeFilter === 'today' && appointmentDate === today)
        || (rangeFilter === 'future' && appointmentDate > today);
      const matchesStatus = statusFilter === 'all'
        || appointment.status === statusFilter
        || (statusFilter === 'confirmed' && appointment.status === 'approved');
      return matchesRange && matchesStatus;
    });

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
      <div className="sticky-top-safe z-30 glass border-b border-white/10 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/admin')} className="press-scale">
          <ArrowRight className="w-6 h-6" />
        </button>
        <div>
          <h1 className="font-black text-lg">ניהול תורים</h1>
          <p className="text-muted-foreground text-xs">{filtered.length} תורים</p>
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          className="mr-auto gold-gradient p-2.5 rounded-xl"
        >
          <Plus className="w-4 h-4 text-black" />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="px-4 py-3 space-y-2">
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
        <div className="mx-4 mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
          {DATA_LOAD_ERROR_MESSAGE}
        </div>
      )}
      {(servicesError || barbersError || customersError) && (
        <div className="mx-4 mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
          {DATA_LOAD_ERROR_MESSAGE}
        </div>
      )}
      {mutationError && (
        <div className="mx-4 mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
          {/** @type {any} */ (mutationError).code === 'functions/already-exists'
            ? 'הפעולה נחסמה כי התור חופף לתור קיים של אותו ספר.'
            : 'הפעולה נכשלה. יש לוודא שנבחרו ספר ושירות תקינים ולנסות שוב.'}
        </div>
      )}

      <div className="px-4 space-y-2 pb-6">
        {filtered.map((appt, i) => {
          const sc = STATUS_CONFIG[appt.status] || STATUS_CONFIG.pending;
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
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${sc.color}`}>{sc.label}</span>
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
                  <div className="text-primary font-black">₪{appt.service_price}</div>
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
                {appt.status === 'pending' && (() => {
                  const key = `${appt.id}:approve`;
                  const loading = isActionLoading(key);
                  return (
                    <button
                      onClick={() => handleQuickAction(key, () => updateMutation.mutate({ id: appt.id, data: { status: 'confirmed' } }))}
                      disabled={loadingAction !== null}
                      className="flex-1 py-1.5 rounded-xl bg-green-500/15 text-green-400 text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      {loading ? 'מאשר...' : 'אשר'}
                    </button>
                  );
                })()}
                {(appt.status === 'pending' || appt.status === 'confirmed') && (
                  <>
                    <button
                      onClick={() => { setNoShowAppt(appt); setNoShowAction('warning'); }}
                      disabled={loadingAction !== null}
                      className="flex-1 py-1.5 rounded-xl bg-orange-500/15 text-orange-400 text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      <UserX className="w-3 h-3" /> לא הגיע
                    </button>
                    <button
                      onClick={() => { setCancelAppt(appt); setCancelReason(''); }}
                      disabled={loadingAction !== null}
                      className="flex-1 py-1.5 rounded-xl bg-red-500/15 text-red-400 text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      <X className="w-3 h-3" /> בטל
                    </button>
                  </>
                )}
                {appt.status === 'confirmed' && (() => {
                  const key = `${appt.id}:complete`;
                  const loading = isActionLoading(key);
                  return (
                    <button
                      onClick={() => handleQuickAction(key, () => updateMutation.mutate({ id: appt.id, data: { status: 'completed' } }))}
                      disabled={loadingAction !== null}
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
                      disabled={loadingAction !== null}
                      className="flex-1 py-1.5 rounded-xl bg-primary/15 text-primary text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      {loading ? 'מסמן...' : 'סמן שולם'}
                    </button>
                  );
                })()}
                {(() => {
                  const key = `${appt.id}:delete`;
                  const loading = isActionLoading(key);
                  return (
                    <button
                      onClick={() => {
                        if (!window.confirm('למחוק תור זה?')) return;
                        handleQuickAction(key, () => deleteMutation.mutate(appt.id));
                      }}
                      disabled={loadingAction !== null}
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
      <AnimatePresence>
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
        {cancelAppt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="keyboard-safe-overlay fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
            onClick={() => setCancelAppt(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="keyboard-safe-modal dark-card rounded-3xl w-full max-w-sm mx-4"
              onClick={event => event.stopPropagation()}
              dir="rtl"
            >
              <div className="px-5 pt-5 pb-3 flex-shrink-0">
                <h3 className="font-black text-lg mb-1">ביטול תור</h3>
                <p className="text-muted-foreground text-sm">
                  כתוב סיבת ביטול שתופיע בהיסטוריית התור ללקוח ולניהול.
                </p>
              </div>
              <div className="modal-scroll-body px-5">
                <textarea
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  rows={4}
                  placeholder="לדוגמה: הלקוח ביקש לבטל / שינוי בלו״ז העסק..."
                  className="w-full bg-secondary border border-border rounded-2xl px-3 py-3 text-sm resize-none focus:outline-none focus:border-primary"
                  dir="rtl"
                />
              </div>
              <div className="modal-actions px-5 flex gap-2">
                <button
                  onClick={() => { setCancelAppt(null); setCancelReason(''); }}
                  className="flex-1 glass py-3 rounded-xl font-bold"
                >
                  חזרה
                </button>
                <button
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
              </div>
            </motion.div>
          </motion.div>
        )}
        {noShowAppt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="keyboard-safe-overlay fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
            onClick={() => setNoShowAppt(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="keyboard-safe-modal dark-card rounded-3xl w-full max-w-sm mx-4"
              onClick={event => event.stopPropagation()}
              dir="rtl"
            >
              <div className="px-5 pt-5 pb-3 flex-shrink-0">
                <h3 className="font-black text-lg mb-1">סימון אי הגעה</h3>
                <p className="text-muted-foreground text-sm">
                  בחר מה לעשות עם הלקוח בעקבות אי הגעה לתור.
                </p>
              </div>
              <div className="modal-scroll-body px-5">
                <div className="space-y-2 pb-1">
                  {[
                    { value: 'warning', label: 'אזהרה בלבד', description: 'הוספת אזהרה לפרופיל הלקוח.' },
                    { value: 'payment_required', label: 'דרוש תשלום 50%', description: 'יסומן שנדרש תשלום לפני ההזמנה הבאה.' },
                    { value: 'block', label: 'חסום לקוח', description: 'מונע מהלקוח לקבוע תורים חדשים.' },
                  ].map((option) => (
                    <button
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
              </div>
              <div className="modal-actions px-5 flex gap-2">
                <button onClick={() => setNoShowAppt(null)} className="flex-1 glass py-3 rounded-xl font-bold">
                  ביטול
                </button>
                <button
                  onClick={() => {
                    setLoadingAction(`${noShowAppt.id}:noshow`);
                    updateMutation.mutate({
                      id: noShowAppt.id,
                      data: { status: 'no_show', noShowAction },
                    });
                  }}
                  disabled={updateMutation.isPending}
                  className="flex-1 gold-gradient text-black py-3 rounded-xl font-black flex items-center justify-center gap-2"
                >
                  {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {updateMutation.isPending ? 'שומר...' : 'סמן לא הגיע'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
