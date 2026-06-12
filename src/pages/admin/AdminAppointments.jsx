import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check, X, UserX, Plus, Edit3, Calendar, Clock, Scissors, Save, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listAllBarbers, listAllServices } from '@/lib/businessFirestore';
import { localDateToString } from '../../lib/slotEngine';
import {
  createAdminAppointment,
  deleteAppointment,
  updateAdminAppointment,
} from '@/lib/appointmentsFirestore';
import { useAdminAppointmentsRealtime } from '@/hooks/useAppointmentsRealtime';

const STATUS_CONFIG = {
  pending:   { label: 'ממתין',  color: 'text-yellow-400 bg-yellow-400/20', dot: 'bg-yellow-400' },
  confirmed: { label: 'מאושר', color: 'text-green-400 bg-green-400/20',   dot: 'bg-green-400' },
  completed: { label: 'הושלם', color: 'text-primary bg-primary/20',       dot: 'bg-primary' },
  cancelled: { label: 'בוטל',  color: 'text-red-400 bg-red-400/20',       dot: 'bg-red-400' },
  no_show:   { label: 'לא הגיע', color: 'text-orange-400 bg-orange-400/20', dot: 'bg-orange-400' },
};

// Generate time slots for edit
const TIME_SLOTS = [];
for (let h = 6; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    TIME_SLOTS.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
  }
}

function EditAppointmentSheet({ appt, services, barbers, onSave, onClose, isSaving, error }) {
  const [form, setForm] = useState({
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
      className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center px-4 pb-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="dark-card rounded-3xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-black text-lg">עריכת תור</h3>
          <button onClick={onClose} className="glass p-2 rounded-xl">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
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
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-right focus:outline-none focus:border-primary"
              dir="ltr"
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
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setForm(f => ({ ...f, status: key }))}
                  className={`py-2 rounded-xl text-xs font-bold transition-all ${
                    form.status === key ? cfg.color : 'glass text-muted-foreground'
                  }`}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <label className="flex items-center justify-between glass rounded-xl px-3 py-2.5">
            <span className="text-sm font-bold">שולם</span>
            <input
              type="checkbox"
              checked={form.paid}
              onChange={e => setForm(f => ({ ...f, paid: e.target.checked }))}
              className="accent-primary w-5 h-5"
            />
          </label>

          {/* Notes */}
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

          {/* Admin notes */}
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

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-400 text-sm">
            {error.code === 'functions/already-exists' ? 'התור חופף לתור קיים של אותו ספר.' : 'שמירת התור נכשלה.'}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl glass text-muted-foreground font-bold text-sm">
            ביטול
          </button>
          <button
            onClick={() => onSave(appt.id, form)}
            disabled={isSaving}
            className="flex-1 py-3 rounded-2xl gold-gradient text-black font-black text-sm flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'שומר...' : 'שמור'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function AdminAppointments() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [editAppt, setEditAppt] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);

  const { appointments, error: appointmentsError } = useAdminAppointmentsRealtime();

  const { data: services = [] } = useQuery({
    queryKey: ['admin-services'],
    queryFn: listAllServices,
  });
  const { data: barbers = [] } = useQuery({
    queryKey: ['admin-barbers'],
    queryFn: listAllBarbers,
  });

  const updateMutation = useMutation({
    mutationFn: (/** @type {any} */ { id, data }) => updateAdminAppointment(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_appointments'] });
      setSelectedAppt(null);
      setEditAppt(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteAppointment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_appointments'] });
      setSelectedAppt(null);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data) => createAdminAppointment(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_appointments'] });
      setShowNewForm(false);
    },
  });
  const mutationError = updateMutation.error || deleteMutation.error || createMutation.error;

  const filtered = filter === 'all' ? appointments : appointments.filter(a => a.status === filter);

  const BLANK_APPT = {
    id: '__new__',
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
    if (id === '__new__') {
      createMutation.mutate(form);
    } else {
      updateMutation.mutate({ id, data: form });
    }
  };

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky top-0 z-30 glass border-b border-white/10 px-4 py-4 flex items-center gap-3">
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
      <div className="flex gap-2 px-4 py-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {['all', 'pending', 'confirmed', 'completed', 'cancelled', 'no_show'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-bold transition-all ${
              filter === status ? 'gold-gradient text-black' : 'glass text-muted-foreground'
            }`}
          >
            {status === 'all' ? 'הכל' : STATUS_CONFIG[status]?.label}
          </button>
        ))}
      </div>

      {appointmentsError && (
        <div className="mx-4 mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
          לא ניתן לקרוא תורים מ-Firestore. ודא שהמשתמש מחובר ל-Firebase ומופיע באוסף admins.
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

              {/* Quick action buttons */}
              <div className="flex gap-1.5 mt-3">
                {appt.status === 'pending' && (
                  <button
                    onClick={() => updateMutation.mutate({ id: appt.id, data: { status: 'confirmed' } })}
                    className="flex-1 py-1.5 rounded-xl bg-green-500/15 text-green-400 text-xs font-bold flex items-center justify-center gap-1"
                  >
                    <Check className="w-3 h-3" /> אשר
                  </button>
                )}
                {(appt.status === 'pending' || appt.status === 'confirmed') && (
                  <>
                    <button
                      onClick={() => updateMutation.mutate({ id: appt.id, data: { status: 'no_show' } })}
                      className="flex-1 py-1.5 rounded-xl bg-orange-500/15 text-orange-400 text-xs font-bold flex items-center justify-center gap-1"
                    >
                      <UserX className="w-3 h-3" /> לא הגיע
                    </button>
                    <button
                      onClick={() => updateMutation.mutate({ id: appt.id, data: { status: 'cancelled' } })}
                      className="flex-1 py-1.5 rounded-xl bg-red-500/15 text-red-400 text-xs font-bold flex items-center justify-center gap-1"
                    >
                      <X className="w-3 h-3" /> בטל
                    </button>
                  </>
                )}
                {appt.status === 'confirmed' && (
                  <button
                    onClick={() => updateMutation.mutate({ id: appt.id, data: { status: 'completed' } })}
                    className="flex-1 py-1.5 rounded-xl bg-primary/15 text-primary text-xs font-bold flex items-center justify-center gap-1"
                  >
                    <Check className="w-3 h-3" /> הושלם
                  </button>
                )}
                {!appt.paid && (
                  <button
                    onClick={() => updateMutation.mutate({ id: appt.id, data: { paid: true } })}
                    className="flex-1 py-1.5 rounded-xl bg-primary/15 text-primary text-xs font-bold"
                  >
                    סמן שולם
                  </button>
                )}
                <button
                  onClick={() => { if (window.confirm('למחוק תור זה?')) deleteMutation.mutate(appt.id); }}
                  className="py-1.5 px-3 rounded-xl bg-red-500/10 text-red-400 text-xs font-bold"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
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
            onSave={handleSave}
            onClose={() => setShowNewForm(false)}
            isSaving={createMutation.isPending}
            error={createMutation.error}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
