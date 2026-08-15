import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, Scissors, XCircle, RefreshCcw, Plus, AlertTriangle, Pencil, BellRing } from 'lucide-react';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useMutation } from '@tanstack/react-query';
import GoldButton from '../components/ui/GoldButton';
import EditAppointmentModal from '../components/booking/EditAppointmentModal';
import { cancelOwnAppointment } from '@/lib/appointmentsFirestore';
import { cancelOwnWaitingListEntry, subscribeToCustomerWaitingList } from '@/lib/waitingListFirestore';
import { useCustomerAppointmentsRealtime } from '@/hooks/useAppointmentsRealtime';
import { getBookingRejectionMessage } from '@/lib/bookingErrors';
import { useBusinessSettingsRealtime } from '@/hooks/useBookingData';
import { getCancellationReasonLabel } from '@/lib/labels';
import { formatILS } from '@/lib/formatters';
import {
  CUSTOMER_CANCEL_REASONS,
  getEffectiveAppointmentStatus,
  isAppointmentActiveForSchedule,
  isAppointmentHistoryForSchedule,
} from '@/lib/appointmentStatus';
import { toast } from '@/components/ui/use-toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ModalActions, ModalBody, ModalShell } from '@/components/ui/ModalShell';

const STATUS_LABELS = {
  pending: { label: 'ממתין', pill: 'status-pill--warning' },
  approved: { label: 'מאושר', pill: 'status-pill--success' },
  confirmed: { label: 'מאושר', pill: 'status-pill--success' },
  completed: { label: 'הושלם', pill: 'status-pill--accent' },
  completed_auto: { label: 'הושלם — התספורת בוצעה', pill: 'status-pill--accent' },
  cancelled: { label: 'בוטל', pill: 'status-pill--danger' },
  cancelled_by_admin: { label: 'בוטל מצד הספר', pill: 'status-pill--danger' },
  cancelled_by_customer: { label: 'בוטל מצד הלקוח', pill: 'status-pill--warning' },
  rejected: { label: 'נדחה', pill: 'status-pill--danger' },
  no_show: { label: 'אי הגעה', pill: 'status-pill--warning' },
};

const WAITING_STATUS_LABELS = {
  active: { label: 'ממתין', pill: 'status-pill--warning' },
  notified: { label: 'נמצא תור!', pill: 'status-pill--accent' },
};

const PREFERENCE_LABELS = {
  exact_time: (e) => `שעה: ${e.exactTime || '-'}`,
  time_range: (e) => `טווח: ${e.startTime || '-'}–${e.endTime || '-'}`,
  day_part: (e) => ({ morning: 'בוקר', noon: 'צהריים', evening: 'ערב' }[e.dayPart] || '-'),
  whole_day: () => 'כל היום',
};

export default function Appointments() {
  const navigate = useNavigate();
  const { currentUser } = useCurrentUser();
  const [activeTab, setActiveTab] = useState('upcoming');
  const [cancelModal, setCancelModal] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [editModal, setEditModal] = useState(null);
  const [waitingList, setWaitingList] = useState([]);
  const [cancelWlModal, setCancelWlModal] = useState(null);
  const [cancelWlBusy, setCancelWlBusy] = useState(false);

  const { appointments, isLoading, error: appointmentsError } = useCustomerAppointmentsRealtime(Boolean(currentUser));
  const { settings: businessSettings } = useBusinessSettingsRealtime();
  const cancellationDeadlineMinutes = businessSettings?.cancellationDeadlineMinutesBeforeAppointment ?? 180;

  useEffect(() => {
    if (!currentUser) return undefined;
    return subscribeToCustomerWaitingList(setWaitingList, (err) => {
      console.warn('[Appointments] waiting list load failed', { code: err?.code });
    });
  }, [currentUser]);

  const cancelMutation = useMutation({
    mutationFn: (id) => cancelOwnAppointment(id, cancelReason.trim() || 'customer_cancelled'),
    onSuccess: () => {
      setCancelModal(null);
      setCancelReason('');
    },
  });

  const now = new Date();
  const upcoming = appointments.filter(a => isAppointmentActiveForSchedule(a, now));
  const past = appointments.filter(a => isAppointmentHistoryForSchedule(a, now));
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
          { key: 'waiting', label: waitingList.length > 0 ? `המתנה (${waitingList.length})` : 'המתנה' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${activeTab === tab.key ? 'gold-gradient text-black' : 'text-muted-foreground'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Waiting list tab content */}
      {activeTab === 'waiting' && (
        <div className="px-4 space-y-3">
          {waitingList.length === 0 ? (
            <div className="text-center py-16">
              <BellRing className="w-14 h-14 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">אין בקשות המתנה פעילות</p>
              <button onClick={() => navigate('/booking')} className="mt-3 text-primary font-bold text-sm">
                קבע תור עכשיו
              </button>
            </div>
          ) : (
            waitingList.map((entry) => {
              const wlStatus = WAITING_STATUS_LABELS[entry.status] || WAITING_STATUS_LABELS.active;
              const prefFn = PREFERENCE_LABELS[entry.preferenceType] || PREFERENCE_LABELS.whole_day;
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="dark-card rounded-2xl p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 glass-gold rounded-xl flex items-center justify-center">
                        <Clock className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <div className="font-bold">{entry.serviceName || 'כל שירות'}</div>
                        <div className="text-muted-foreground text-sm">{entry.date || '-'}</div>
                      </div>
                    </div>
                    <span className={`status-pill ${wlStatus.pill}`}>
                      {wlStatus.label}
                    </span>
                  </div>
                  <div className="text-muted-foreground text-xs mb-3">{prefFn(entry)}</div>
                  {entry.barberName && (
                    <div className="text-muted-foreground text-xs mb-3">ספר: {entry.barberName}</div>
                  )}
                  {entry.status === 'notified' && (
                    <button
                      type="button"
                      onClick={() => navigate('/booking', {
                        state: {
                          preselect: {
                            date: entry.date || null,
                            startTime: entry.availableStartTime || entry.exactTime || entry.startTime || null,
                            serviceId: entry.serviceId || null,
                            barberId: entry.barberId || null,
                            waitingListEntryId: entry.id,
                          },
                        },
                      })}
                      className="mb-3 w-full rounded-xl border border-primary/30 bg-primary/10 p-2 text-primary text-xs font-bold text-center"
                    >
                      נמצא תור! לחץ כאן להזמנה
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setCancelWlModal(entry)}
                    className="w-full flex items-center justify-center gap-1.5 bg-red-500/10 text-red-400 py-2 rounded-xl text-sm font-medium"
                  >
                    <XCircle className="w-4 h-4" /> הסר מרשימת המתנה
                  </button>
                </motion.div>
              );
            })
          )}
        </div>
      )}

      {activeTab !== 'waiting' && <div className="px-4 space-y-3">
        {appointmentsError ? (
          <div className="banner-error text-center">
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
            const displayStatus = getEffectiveAppointmentStatus(appt, now);
            const statusInfo = STATUS_LABELS[displayStatus] || STATUS_LABELS.pending;
            const apptDate = new Date(`${appt.date}T00:00:00`);
            const isUpcoming = isAppointmentActiveForSchedule(appt, now);
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
                      {(appt.barber_name || appt.barberName) && (
                        <div className="text-muted-foreground text-xs mt-0.5 flex items-center gap-1">
                          <Scissors className="w-3 h-3 text-primary/70" />
                          {appt.barber_name || appt.barberName}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className={`status-pill ${statusInfo.pill}`}>
                    {statusInfo.label}
                  </span>
                </div>
                {appt.service_price && (
                  <div className="text-primary font-black">{formatILS(appt.service_price)}</div>
                )}
                {appt.status === 'cancelled' && appt.cancellationReason
                  && !CUSTOMER_CANCEL_REASONS.has(appt.cancellationReason)
                  && appt.cancellationReason !== 'admin_cancelled' && (
                  <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-200">
                    <span className="font-bold">סיבת ביטול: </span>
                    {getCancellationReasonLabel(appt.cancellationReason)}
                  </div>
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
                {!isUpcoming && (displayStatus === 'completed' || displayStatus === 'completed_auto') && (
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
      </div>}

      <ConfirmDialog
        open={Boolean(cancelWlModal)}
        title="הסרה מרשימת המתנה"
        description="האם להסיר את בקשת ההמתנה? לא יישלחו עוד עדכונים עבור הבקשה הזו."
        confirmLabel="הסר בקשה"
        onClose={() => setCancelWlModal(null)}
        busy={cancelWlBusy}
        onConfirm={async () => {
          if (!cancelWlModal || cancelWlBusy) return;
          setCancelWlBusy(true);
          try {
            await cancelOwnWaitingListEntry(cancelWlModal.id);
            setCancelWlModal(null);
          } catch (err) {
            console.error('[WL] cancel failed', err?.code);
            toast({ variant: 'destructive', title: 'הסרת הבקשה נכשלה', description: 'אפשר לנסות שוב בעוד רגע.' });
          } finally {
            setCancelWlBusy(false);
          }
        }}
      />

      {/* Edit Modal */}
      <AnimatePresence>
        {editModal && (
          <EditAppointmentModal
            appointment={editModal}
            onClose={() => setEditModal(null)}
          />
        )}
      </AnimatePresence>

      <ModalShell
        open={Boolean(cancelModal)}
        onClose={() => { setCancelModal(null); setCancelReason(''); }}
        label="ביטול תור"
        closeOnBackdrop={false}
        closeOnEscape={false}
        busy={cancelMutation.isPending}
        level="confirmation"
        className="dark-card max-w-sm rounded-3xl"
      >
        {cancelModal && (
          <>
              {/* Header — always visible */}
              <div className="flex items-center gap-3 px-5 pt-5 pb-3 flex-shrink-0">
                <AlertTriangle className="w-8 h-8 text-yellow-400 flex-shrink-0" />
                <div>
                  <div className="font-bold">ביטול תור</div>
                  <div className="text-muted-foreground text-sm">האם אתה בטוח שברצונך לבטל?</div>
                </div>
              </div>

              {/* Scrollable body */}
              <ModalBody>
                <p className="text-sm text-muted-foreground mb-4">
                  ניתן לבטל עד {cancellationDeadlineMinutes} דקות לפני מועד התור לפי מדיניות העסק.
                </p>
                <div className="mb-2">
                  <label className="text-xs text-muted-foreground font-semibold mb-1.5 block">סיבת ביטול (אופציונלי)</label>
                  <textarea
                    value={cancelReason}
                    onChange={e => setCancelReason(e.target.value)}
                    placeholder="לדוגמה: לא אוכל להגיע..."
                    rows={2}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary"
                    dir="rtl"
                  />
                </div>
                {cancelMutation.error && (
                  <div className="mt-2 banner-error">
                    {getBookingRejectionMessage(cancelMutation.error)}
                  </div>
                )}
              </ModalBody>

              {/* Actions — always visible */}
              <ModalActions className="flex gap-3">
                <button type="button" onClick={() => { setCancelModal(null); setCancelReason(''); }} disabled={cancelMutation.isPending} className="flex-1 glass py-3 rounded-xl font-bold disabled:cursor-wait disabled:opacity-50">
                  חזרה
                </button>
                <button
                  type="button"
                  onClick={() => cancelMutation.mutate(cancelModal.id)}
                  disabled={cancelMutation.isPending}
                  className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold disabled:cursor-wait disabled:opacity-50"
                >
                  {cancelMutation.isPending ? 'מבטל...' : 'בטל תור'}
                </button>
              </ModalActions>
          </>
        )}
      </ModalShell>
    </div>
  );
}
