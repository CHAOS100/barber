import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, Scissors, XCircle, RefreshCcw, Plus, AlertTriangle, Pencil, BellRing } from 'lucide-react';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useMutation } from '@tanstack/react-query';
import GoldButton from '../components/ui/GoldButton';
import EditAppointmentModal from '../components/booking/EditAppointmentModal';
import { localDateToString } from '../lib/slotEngine';
import { cancelOwnAppointment } from '@/lib/appointmentsFirestore';
import { cancelOwnWaitingListEntry, subscribeToCustomerWaitingList } from '@/lib/waitingListFirestore';
import { useCustomerAppointmentsRealtime } from '@/hooks/useAppointmentsRealtime';
import { getBookingRejectionMessage } from '@/lib/bookingErrors';
import { useBusinessSettingsRealtime } from '@/hooks/useBookingData';
import { getCancellationReasonLabel } from '@/lib/labels';

const STATUS_LABELS = {
  pending: { label: 'ממתין', color: 'text-yellow-400 bg-yellow-400/20' },
  approved: { label: 'מאושר', color: 'text-green-400 bg-green-400/20' },
  confirmed: { label: 'מאושר', color: 'text-green-400 bg-green-400/20' },
  completed: { label: 'הושלם', color: 'text-primary bg-primary/20' },
  completed_auto: { label: 'הושלם — התספורת בוצעה', color: 'text-primary bg-primary/20' },
  cancelled: { label: 'בוטל', color: 'text-red-400 bg-red-400/20' },
  cancelled_by_admin: { label: 'בוטל מצד הספר', color: 'text-red-400 bg-red-400/20' },
  cancelled_by_customer: { label: 'בוטל מצד הלקוח', color: 'text-orange-400 bg-orange-400/20' },
  rejected: { label: 'נדחה', color: 'text-red-400 bg-red-400/20' },
  no_show: { label: 'אי הגעה', color: 'text-orange-400 bg-orange-400/20' },
};

const ACTIVE_STATUSES = new Set(['pending', 'approved', 'confirmed', 'scheduled']);
const HISTORY_TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'rejected', 'no_show']);
const CUSTOMER_CANCEL_REASONS = new Set(['customer_cancelled', 'customer_replaced_appointment']);

const getDisplayStatus = (appt, today) => {
  if (appt.date < today && ACTIVE_STATUSES.has(appt.status)) return 'completed_auto';
  if (appt.status === 'cancelled') {
    const reason = appt.cancellationReason || appt.cancellation_reason || '';
    return CUSTOMER_CANCEL_REASONS.has(reason) ? 'cancelled_by_customer' : 'cancelled_by_admin';
  }
  return appt.status;
};

const WAITING_STATUS_LABELS = {
  active: { label: 'ממתין', color: 'text-yellow-400 bg-yellow-400/20' },
  notified: { label: 'נמצא תור!', color: 'text-primary bg-primary/20' },
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

  const todayStr = localDateToString();
  const upcoming = appointments.filter(a => !HISTORY_TERMINAL_STATUSES.has(a.status) && a.date >= todayStr);
  const past = appointments.filter(a => HISTORY_TERMINAL_STATUSES.has(a.status) || a.date < todayStr);
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
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${wlStatus.color}`}>
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
            const displayStatus = getDisplayStatus(appt, todayStr);
            const statusInfo = STATUS_LABELS[displayStatus] || STATUS_LABELS.pending;
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

      {/* Cancel waiting list modal */}
      <AnimatePresence>
        {cancelWlModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="keyboard-safe-overlay fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
            onClick={() => setCancelWlModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              className="keyboard-safe-modal dark-card rounded-3xl p-6 w-full max-w-sm"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <BellRing className="w-8 h-8 text-primary" />
                <div>
                  <div className="font-bold">הסרה מרשימת המתנה</div>
                  <div className="text-muted-foreground text-sm">האם להסיר את הבקשה?</div>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setCancelWlModal(null)} className="flex-1 glass py-3 rounded-xl font-bold">חזרה</button>
                <button
                  disabled={cancelWlBusy}
                  onClick={async () => {
                    setCancelWlBusy(true);
                    try { await cancelOwnWaitingListEntry(cancelWlModal.id); setCancelWlModal(null); }
                    catch (err) { console.error('[WL] cancel failed', err?.code); }
                    finally { setCancelWlBusy(false); }
                  }}
                  className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold disabled:opacity-60"
                >
                  {cancelWlBusy ? 'מסיר...' : 'הסר'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
              <div className="mb-4">
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
              <div className="flex gap-3">
                <button onClick={() => { setCancelModal(null); setCancelReason(''); }} className="flex-1 glass py-3 rounded-xl font-bold">
                  חזרה
                </button>
                <button
                  onClick={() => cancelMutation.mutate(cancelModal.id)}
                  disabled={cancelMutation.isPending}
                  className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold"
                >
                  {cancelMutation.isPending ? 'מבטל...' : 'בטל תור'}
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
