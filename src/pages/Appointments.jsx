import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Scissors, XCircle, RefreshCcw, Plus, AlertTriangle, Pencil } from 'lucide-react';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useMutation } from '@tanstack/react-query';
import GoldButton from '../components/ui/GoldButton';
import EditAppointmentModal from '../components/booking/EditAppointmentModal';
import { localDateToString } from '../lib/slotEngine';
import { cancelOwnAppointment } from '@/lib/appointmentsFirestore';
import { useCustomerAppointmentsRealtime } from '@/hooks/useAppointmentsRealtime';
import { getBookingRejectionMessage } from '@/lib/bookingErrors';
import { useBusinessSettingsRealtime } from '@/hooks/useBookingData';

const STATUS_LABELS = {
  pending: { label: 'ממתין', color: 'text-yellow-400 bg-yellow-400/20' },
  confirmed: { label: 'מאושר', color: 'text-green-400 bg-green-400/20' },
  completed: { label: 'הושלם', color: 'text-primary bg-primary/20' },
  cancelled: { label: 'בוטל', color: 'text-red-400 bg-red-400/20' },
  no_show: { label: 'לא הגיע', color: 'text-orange-400 bg-orange-400/20' },
};

export default function Appointments() {
  const navigate = useNavigate();
  const { currentUser } = useCurrentUser();
  const [activeTab, setActiveTab] = useState('upcoming');
  const [cancelModal, setCancelModal] = useState(null);
  const [editModal, setEditModal] = useState(null);

  const { appointments, isLoading, error: appointmentsError } = useCustomerAppointmentsRealtime(Boolean(currentUser));
  const { settings: businessSettings } = useBusinessSettingsRealtime();
  const cancellationDeadlineMinutes = businessSettings?.cancellationDeadlineMinutesBeforeAppointment ?? 180;

  const cancelMutation = useMutation({
    mutationFn: (id) => cancelOwnAppointment(id),
    onSuccess: () => {
      setCancelModal(null);
    },
  });

  const todayStr = localDateToString();
  const upcoming = appointments.filter(a => a.status !== 'cancelled' && a.status !== 'completed' && a.date >= todayStr);
  const past = appointments.filter(a => a.status === 'completed' || a.status === 'cancelled' || a.date < todayStr);
  const displayed = activeTab === 'upcoming' ? upcoming : past;

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 page-transition" dir="rtl">
        <Calendar className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-black mb-2">התורים שלי</h2>
        <p className="text-muted-foreground text-center mb-6">יש להתחבר כדי לצפות בתורים שלך</p>
        <GoldButton onClick={() => navigate('/login', { state: { next: '/appointments' } })} size="lg">
          כניסה
        </GoldButton>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="px-4 pt-12 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black">התורים שלי</h1>
            <p className="text-muted-foreground text-sm">שלום, {currentUser.name}</p>
          </div>
          <GoldButton onClick={() => navigate('/booking')} size="sm">
            <Plus className="w-4 h-4 ml-1" /> קבע תור
          </GoldButton>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-4 mb-4 glass mx-4 rounded-2xl p-1">
        {[
          { key: 'upcoming', label: `קרובים (${upcoming.length})` },
          { key: 'past', label: `היסטוריה (${past.length})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${activeTab === tab.key ? 'gold-gradient text-black' : 'text-muted-foreground'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="px-4 space-y-3">
        {appointmentsError ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm text-center">
            לא הצלחנו לטעון את הנתונים. נסה לרענן.
          </div>
        ) : isLoading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="dark-card rounded-2xl p-4 space-y-2">
              <div className="skeleton h-5 w-1/2 rounded-xl" />
              <div className="skeleton h-4 w-3/4 rounded-xl" />
            </div>
          ))
        ) : displayed.length === 0 ? (
          <div className="text-center py-16">
            <Calendar className="w-16 h-16 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">{activeTab === 'upcoming' ? 'אין תורים קרובים' : 'אין היסטוריה'}</p>
            {activeTab === 'upcoming' && (
              <button onClick={() => navigate('/booking')} className="mt-3 text-primary font-bold text-sm">
                קבע תור עכשיו
              </button>
            )}
          </div>
        ) : (
          displayed.map((appt, i) => {
            const statusInfo = STATUS_LABELS[appt.status] || STATUS_LABELS.pending;
            const apptDate = new Date(`${appt.date}T00:00:00`);
            const isUpcoming = appt.date >= todayStr && appt.status !== 'cancelled';
            return (
              <motion.div
                key={appt.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="dark-card rounded-2xl p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 glass-gold rounded-xl flex items-center justify-center">
                      <Scissors className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-bold">{appt.service_name}</div>
                      <div className="text-muted-foreground text-sm">
                        {apptDate.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' })} • {appt.time}
                      </div>
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                </div>
                {appt.service_price && (
                  <div className="text-primary font-black">₪{appt.service_price}</div>
                )}
                {isUpcoming && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => setEditModal(appt)}
                      className="flex-1 flex items-center justify-center gap-1 glass py-2 rounded-xl text-sm font-medium text-primary"
                    >
                      <Pencil className="w-4 h-4" /> ערוך מועד
                    </button>
                    <button
                      onClick={() => setCancelModal(appt)}
                      className="flex-1 flex items-center justify-center gap-1 bg-red-500/10 text-red-400 py-2 rounded-xl text-sm font-medium"
                    >
                      <XCircle className="w-4 h-4" /> בטל תור
                    </button>
                  </div>
                )}
                {!isUpcoming && (appt.status === 'completed') && (
                  <div className="mt-3">
                    <button
                      onClick={() => navigate('/booking', { state: { service: { id: appt.service_id, name: appt.service_name, price: appt.service_price, duration: appt.service_duration } } })}
                      className="w-full flex items-center justify-center gap-1 glass py-2 rounded-xl text-sm font-medium"
                    >
                      <RefreshCcw className="w-4 h-4" /> הזמן שוב
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })
        )}
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {editModal && (
          <EditAppointmentModal
            appointment={editModal}
            onClose={() => setEditModal(null)}
          />
        )}
      </AnimatePresence>

      {/* Cancel Modal */}
      <AnimatePresence>
        {cancelModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="keyboard-safe-overlay fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
            onClick={() => setCancelModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              className="keyboard-safe-modal dark-card rounded-3xl p-6 w-full max-w-sm overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-8 h-8 text-yellow-400" />
                <div>
                  <div className="font-bold">ביטול תור</div>
                  <div className="text-muted-foreground text-sm">האם אתה בטוח שברצונך לבטל?</div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                ניתן לבטל עד {cancellationDeadlineMinutes} דקות לפני מועד התור לפי מדיניות העסק.
              </p>
              <p className="hidden">
                ביטול פחות מ-3 שעות לפני התור עלול לגרום להוספת אזהרה לפרופיל שלך.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setCancelModal(null)} className="flex-1 glass py-3 rounded-xl font-bold">
                  חזרה
                </button>
                <button
                  onClick={() => cancelMutation.mutate(cancelModal.id)}
                  disabled={cancelMutation.isPending}
                  className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold"
                >
                  בטל תור
                </button>
              </div>
              {cancelMutation.error && (
                <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-400 text-sm">
                  {getBookingRejectionMessage(cancelMutation.error)}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
