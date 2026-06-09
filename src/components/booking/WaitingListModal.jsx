import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BellRing, CheckCircle2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { localDb } from '@/lib/localData';
import GoldButton from '../ui/GoldButton';

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];
const MONTH_NAMES = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

function generateDates() {
  const dates = [];
  const today = new Date();
  for (let i = 1; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (d.getDay() !== 6) dates.push(d);
  }
  return dates;
}

export default function WaitingListModal({ isOpen, onClose, currentUser, serviceName }) {
  const [selectedDate, setSelectedDate] = useState(null);
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [joined, setJoined] = useState(false);

  const dates = generateDates();

  const mutation = useMutation({
    mutationFn: (/** @type {any} */ data) => localDb.WaitingList.create(data),
    onSuccess: () => setJoined(true),
    onError: () => setJoined(true), // demo mode
  });

  const handleJoin = () => {
    if (!selectedDate || !phone) return;
    const ds = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
    mutation.mutate({
      customer_name: currentUser?.name || 'אורח',
      customer_phone: phone,
      date: ds,
      service_name: serviceName || 'כל שירות',
      is_claimed: false,
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center px-4 pb-8"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="dark-card rounded-3xl p-6 w-full max-w-sm"
            onClick={e => e.stopPropagation()}
          >
            {joined ? (
              <div className="text-center py-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400 }}
                  className="w-16 h-16 gold-gradient rounded-full flex items-center justify-center mx-auto mb-4"
                >
                  <CheckCircle2 className="w-8 h-8 text-black" />
                </motion.div>
                <h3 className="text-xl font-black mb-2">נרשמת לרשימת המתנה!</h3>
                <p className="text-muted-foreground text-sm mb-4">נשלח לך הודעה כשיתפנה מקום בתאריך שבחרת</p>
                <GoldButton onClick={onClose} className="w-full">סגור</GoldButton>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <BellRing className="w-5 h-5 text-primary" />
                    <h3 className="font-black text-lg">רשימת המתנה</h3>
                  </div>
                  <button onClick={onClose} className="glass p-2 rounded-xl press-scale">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-muted-foreground text-sm mb-4">
                  בחר תאריך – נעדכן אותך מיד כשיתפנה מקום 🔔
                </p>

                {/* Date selection */}
                <div className="flex gap-2 overflow-x-auto pb-2 mb-4" style={{ scrollbarWidth: 'none' }}>
                  {dates.map((date) => {
                    const isSelected = selectedDate?.toDateString() === date.toDateString();
                    return (
                      <button
                        key={date.toDateString()}
                        onClick={() => setSelectedDate(date)}
                        className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl min-w-[56px] text-xs transition-all ${
                          isSelected ? 'gold-gradient text-black' : 'glass'
                        }`}
                      >
                        <span>{DAY_NAMES[date.getDay()]}</span>
                        <span className="text-lg font-black">{date.getDate()}</span>
                        <span>{MONTH_NAMES[date.getMonth()]}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Phone */}
                <div className="mb-4">
                  <label className="text-sm text-muted-foreground mb-1 block">מספר טלפון לעדכון</label>
                  <input
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="050-0000000"
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-right text-sm focus:outline-none focus:border-primary"
                    dir="rtl"
                  />
                </div>

                <GoldButton
                  onClick={handleJoin}
                  className="w-full"
                  disabled={!selectedDate || !phone || mutation.isPending}
                >
                  {mutation.isPending ? 'מצטרף...' : 'הצטרף לרשימת המתנה'}
                </GoldButton>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
