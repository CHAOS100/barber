import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, ChevronLeft, GripVertical, Clock } from 'lucide-react';

const HOURS = Array.from({ length: 12 }, (_, i) => `${9 + i}:00`);
const STATUS_COLORS = {
  confirmed: 'bg-green-500/20 border-green-500/40 text-green-300',
  pending: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300',
  completed: 'bg-primary/20 border-primary/40 text-primary',
  cancelled: 'bg-red-500/20 border-red-500/40 text-red-300',
};

export default function DailyCalendarView({ appointments = [], onMove }) {
  const [selectedDate, setSelectedDate] = useState(new Date());

  const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
  const dayAppts = appointments.filter(a => a.date === dateStr);

  const prevDay = () => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d); };
  const nextDay = () => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d); };

  const getTopOffset = (time) => {
    const [h, m] = time.split(':').map(Number);
    return ((h - 9) * 60 + m) * (56 / 60); // 56px per hour
  };

  const getHeight = (duration = 30) => duration * (56 / 60);

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <button onClick={prevDay} className="glass p-2 rounded-xl press-scale">
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="text-center">
          <div className="font-black">
            {selectedDate.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <div className="text-xs text-muted-foreground">{dayAppts.length} תורים</div>
        </div>
        <button onClick={nextDay} className="glass p-2 rounded-xl press-scale">
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Timeline */}
      <div className="relative overflow-auto" style={{ maxHeight: 400 }}>
        {/* Hour lines */}
        <div className="relative" style={{ height: HOURS.length * 56 }}>
          {HOURS.map((hour, i) => (
            <div key={hour} className="absolute left-0 right-0 flex items-start" style={{ top: i * 56 }}>
              <div className="w-14 text-xs text-muted-foreground text-left pl-2 pt-0.5 flex-shrink-0">{hour}</div>
              <div className="flex-1 border-t border-white/5 h-14" />
            </div>
          ))}

          {/* Appointments */}
          {dayAppts.map((appt) => {
            const top = getTopOffset(appt.time);
            const height = Math.max(getHeight(appt.service_duration), 40);
            const colorClass = STATUS_COLORS[appt.status] || STATUS_COLORS.pending;
            return (
              <motion.div
                key={appt.id}
                layoutId={appt.id}
                className={`absolute right-14 left-2 rounded-xl border px-2 py-1.5 cursor-grab active:cursor-grabbing ${colorClass}`}
                style={{ top, height }}
                whileHover={{ scale: 1.01 }}
                drag="y"
                dragConstraints={{ top: 0, bottom: HOURS.length * 56 - height }}
                onDragEnd={(_, info) => {
                  const [hours, minutes] = appt.time.split(':').map(Number);
                  const movedMinutes = Math.round((((hours * 60) + minutes) + (info.offset.y * 60 / 56)) / 10) * 10;
                  const clamped = Math.max(9 * 60, Math.min((21 * 60) - (appt.service_duration || 30), movedMinutes));
                  const nextTime = `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
                  if (nextTime !== appt.time) onMove?.(appt, nextTime);
                }}
              >
                <div className="flex items-start gap-1">
                  <GripVertical className="w-3 h-3 opacity-50 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">{appt.customer_name}</div>
                    <div className="text-xs opacity-70 truncate">{appt.service_name}</div>
                    {height > 44 && (
                      <div className="flex items-center gap-1 text-xs opacity-60 mt-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {appt.time} · {appt.service_duration || 30}ד'
                      </div>
                    )}
                  </div>
                  <div className="mr-auto text-xs font-black flex-shrink-0">₪{appt.service_price}</div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {dayAppts.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-muted-foreground text-sm">אין תורים ביום זה</p>
          </div>
        )}
      </div>
    </div>
  );
}
