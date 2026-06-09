import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { localDb } from '@/lib/localData';
import { MOCK_APPOINTMENTS } from '../../lib/mockData';
import { Scissors, RotateCcw, Clock, Calendar, ChevronDown, BellRing } from 'lucide-react';
import WaitingListModal from '../booking/WaitingListModal';
import { localDateToString } from '../../lib/slotEngine';

const STATUS_LABELS = {
  confirmed: { label: 'מאושר', color: 'text-green-400', bg: 'bg-green-400/10' },
  completed: { label: 'הושלם', color: 'text-blue-400', bg: 'bg-blue-400/10' },
  cancelled: { label: 'בוטל', color: 'text-red-400', bg: 'bg-red-400/10' },
  pending: { label: 'ממתין', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  no_show: { label: 'לא הגיע', color: 'text-orange-400', bg: 'bg-orange-400/10' },
};

function AppointmentCard({ appt, index, onRepeat, isFuture }) {
  const [expanded, setExpanded] = useState(false);
  const statusInfo = STATUS_LABELS[appt.status] || STATUS_LABELS.pending;
  const dateStr = new Date(`${appt.date}T00:00:00`).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className={`dark-card rounded-2xl overflow-hidden border ${isFuture ? 'border-primary/20' : 'border-transparent'}`}
    >
      <div
        className="p-4 flex items-center gap-3 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isFuture ? 'gold-gradient' : 'glass-gold'}`}>
          <Scissors className={`w-5 h-5 ${isFuture ? 'text-black' : 'text-primary'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">{appt.service_name}</div>
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs mt-0.5">
            <Clock className="w-3 h-3" />
            {dateStr} • {appt.time}
          </div>
        </div>
        <div className="text-right flex-shrink-0 flex items-center gap-2">
          <div>
            <div className="text-primary font-black text-sm">₪{appt.service_price}</div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.color} ${statusInfo.bg}`}>
              {statusInfo.label}
            </span>
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-white/5"
          >
            <div className="p-4 pt-3 space-y-2">
              {appt.notes && (
                <p className="text-muted-foreground text-xs">📝 {appt.notes}</p>
              )}
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>משך: {appt.service_duration || 30} דקות</span>
                <span>מחיר: ₪{appt.service_price}</span>
              </div>
              {!isFuture && (
                <button
                  onClick={() => onRepeat(appt)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl gold-gradient text-black text-xs font-bold press-scale"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  הזמן שוב
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function AppointmentHistory({ currentUser }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState('upcoming');
  const [showWaiting, setShowWaiting] = useState(false);

  const todayStr = localDateToString();

  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments-history', currentUser?.phone],
    queryFn: () => localDb.Appointment.filter({ customer_phone: currentUser.phone }, '-date'),
    enabled: !!currentUser,
    placeholderData: MOCK_APPOINTMENTS,
  });

  const upcoming = appointments.filter(a =>
    a.date >= todayStr && a.status !== 'cancelled' && a.status !== 'completed'
  ).sort((a, b) => a.date.localeCompare(b.date));

  const past = appointments.filter(a =>
    a.date < todayStr || a.status === 'completed' || a.status === 'cancelled'
  ).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);

  const handleRepeat = (appt) => {
    navigate('/booking', {
      state: {
        service: {
          id: appt.service_id,
          name: appt.service_name,
          price: appt.service_price,
          duration: appt.service_duration || 30,
        }
      }
    });
  };

  const currentList = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="mb-4">
      {/* Tab switcher */}
      <div className="flex glass rounded-2xl p-1 mb-4">
        {[
          { key: 'upcoming', label: `עתידיים (${upcoming.length})` },
          { key: 'past', label: `היסטוריה (${past.length})` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${
              tab === t.key ? 'gold-gradient text-black' : 'text-muted-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Waiting list CTA */}
      <button
        onClick={() => setShowWaiting(true)}
        className="w-full glass-gold rounded-2xl p-3 flex items-center gap-2 mb-3 press-scale"
      >
        <BellRing className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-xs font-bold text-primary">הצטרף לרשימת המתנה לתאריך תפוס</span>
        <Calendar className="w-4 h-4 text-primary mr-auto flex-shrink-0" />
      </button>

      {currentList.length === 0 ? (
        <div className="glass rounded-2xl p-6 text-center">
          <Scissors className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">
            {tab === 'upcoming' ? 'אין תורים מתוכננים' : 'עדיין אין ביקורים'}
          </p>
          {tab === 'upcoming' && (
            <button onClick={() => navigate('/booking')} className="mt-3 text-primary font-bold text-sm">
              קבע תור עכשיו →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {currentList.map((appt, i) => (
            <AppointmentCard
              key={appt.id}
              appt={appt}
              index={i}
              onRepeat={handleRepeat}
              isFuture={tab === 'upcoming'}
            />
          ))}
        </div>
      )}

      <WaitingListModal
        isOpen={showWaiting}
        onClose={() => setShowWaiting(false)}
        currentUser={currentUser}
        serviceName={null}
      />
    </div>
  );
}
