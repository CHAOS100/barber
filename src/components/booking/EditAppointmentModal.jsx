import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, Calendar, Clock, AlertCircle, Check } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getAvailableSlots, getWorkingHoursForDate, isDateBlocked as isBusinessDateBlocked } from '../../lib/slotEngine';
import GoldButton from '../ui/GoldButton';
import { updateOwnAppointment } from '@/lib/appointmentsFirestore';
import { getBookingRejectionMessage } from '@/lib/bookingErrors';
import { useAppointmentBlocksRealtime, useBookingSettingsRealtime } from '@/hooks/useBookingData';

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTH_NAMES = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

function dateToStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function generateDates(workingHours, blockedDates) {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < 21; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const wh = workingHours.find(h => h.day_of_week === d.getDay());
    if (wh && wh.is_open && !isBusinessDateBlocked(dateToStr(d), blockedDates)) dates.push(d);
  }
  return dates;
}

export default function EditAppointmentModal({ appointment, onClose }) {
  const qc = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [done, setDone] = useState(false);

  const { settings: bookingSettings } = useBookingSettingsRealtime();
  const workingHours = bookingSettings?.workingHours || [];
  const blockedDates = bookingSettings?.blockedDates || [];

  const selectedDateStr = selectedDate ? dateToStr(selectedDate) : null;

  const { data: appointmentBlocks } = useAppointmentBlocksRealtime(selectedDateStr);

  // Exclude the current appointment from the occupied slots so it doesn't block itself
  const otherAppointments = useMemo(
    () => appointmentBlocks.filter(a => a.id !== appointment.id && a.barberId === appointment.barber_id),
    [appointmentBlocks, appointment.id, appointment.barber_id]
  );

  const availableDates = useMemo(
    () => generateDates(workingHours, blockedDates),
    [workingHours, blockedDates],
  );

  const isDateBlocked = useMemo(() => {
    if (!selectedDate) return false;
    return isBusinessDateBlocked(dateToStr(selectedDate), blockedDates);
  }, [selectedDate, blockedDates]);

  const availableSlots = useMemo(() => {
    if (!selectedDate || isDateBlocked) return [];
    const ds = dateToStr(selectedDate);
    const wh = getWorkingHoursForDate(ds, workingHours);
    if (!wh || !wh.is_open) return [];
    return getAvailableSlots({
      date: ds,
      serviceDuration: appointment.service_duration || 30,
      service: {
        id: appointment.service_id,
        duration: appointment.service_duration || 30,
        bufferBeforeMinutes: appointment.bufferBeforeMinutes,
        bufferAfterMinutes: appointment.bufferAfterMinutes,
      },
      appointments: otherAppointments,
      workingHours: wh,
      blockedTimes: [],
      slotInterval: bookingSettings?.slotInterval || 10,
      visibleSlotIntervalMinutes: bookingSettings?.visibleSlotIntervalMinutes || 30,
      bufferMinutes: bookingSettings?.appointmentBufferMinutes || 0,
      settings: bookingSettings || {},
    });
  }, [selectedDate, isDateBlocked, workingHours, otherAppointments, appointment.service_duration, bookingSettings]);

  const updateMutation = useMutation({
    mutationFn: () => updateOwnAppointment(appointment.id, {
      date: selectedDateStr,
      startTime: selectedTime,
      durationMinutes: appointment.service_duration || 30,
      status: 'pending',
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['appointments-day'] });
      setDone(true);
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="keyboard-safe-overlay fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="keyboard-safe-modal dark-card rounded-3xl w-full max-w-md"
        onPointerDown={e => e.stopPropagation()}
        dir="rtl"
      >
        {done ? (
          <div className="text-center py-6 px-5">
            <div className="w-16 h-16 gold-gradient rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-black" />
            </div>
            <h3 className="text-xl font-black mb-1">התור עודכן!</h3>
            <p className="text-muted-foreground text-sm mb-2">{selectedDate?.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <p className="text-primary font-bold text-lg">{selectedTime}</p>
            <button onClick={onClose} className="mt-5 text-muted-foreground text-sm">סגור</button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 pt-5 pb-3 flex-shrink-0 flex items-center justify-between">
              <h3 className="font-black text-lg">שינוי מועד תור</h3>
              <button onClick={onClose} className="glass p-2 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="modal-scroll-body px-5">
              {/* Current booking info */}
              <div className="glass-gold rounded-2xl p-3 mb-5 flex justify-between items-center text-sm">
                <span className="text-muted-foreground">{appointment.date} • {appointment.time}</span>
                <span className="font-bold">{appointment.service_name}</span>
              </div>

              {/* Date picker */}
              <div className="mb-1">
                <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" /> בחר תאריך חדש
                </h4>
                <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                  {availableDates.map((date) => {
                    const isSelected = selectedDate?.toDateString() === date.toDateString();
                    const isBlocked = isBusinessDateBlocked(dateToStr(date), blockedDates);
                    return (
                      <motion.button
                        key={date.toDateString()}
                        whileTap={{ scale: 0.92 }}
                        onClick={() => { if (!isBlocked) { setSelectedDate(date); setSelectedTime(null); } }}
                        className={`flex-shrink-0 flex flex-col items-center px-3 py-3 rounded-2xl min-w-[58px] transition-all ${
                          isBlocked ? 'glass opacity-40 cursor-not-allowed' :
                          isSelected ? 'gold-gradient text-black' : 'glass'
                        }`}
                      >
                        <span className="text-xs font-medium">{DAY_NAMES[date.getDay()]}</span>
                        <span className="text-xl font-black">{date.getDate()}</span>
                        <span className="text-xs">{MONTH_NAMES[date.getMonth()]}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Time slots */}
              {selectedDate && !isDateBlocked && (
                <div className="mt-4 pb-2">
                  <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" /> שעות פנויות ({availableSlots.length})
                  </h4>
                  {availableSlots.length === 0 ? (
                    <div className="glass rounded-2xl p-4 text-center">
                      <AlertCircle className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                      <p className="text-muted-foreground text-sm">אין שעות פנויות ביום זה</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {availableSlots.map((time) => (
                        <motion.button
                          key={time}
                          whileTap={{ scale: 0.92 }}
                          onClick={() => setSelectedTime(time)}
                          className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                            selectedTime === time ? 'gold-gradient text-black' : 'glass hover:border-primary/50'
                          }`}
                        >
                          {time}
                        </motion.button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {((selectedDate && selectedTime) || updateMutation.error) && (
              <div className="modal-actions px-5">
                {selectedDate && selectedTime && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <GoldButton
                      onClick={() => updateMutation.mutate()}
                      size="lg"
                      className="w-full"
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? 'מעדכן...' : `אשר — ${selectedDate.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })} בשעה ${selectedTime}`}
                    </GoldButton>
                  </motion.div>
                )}
                {updateMutation.error && (
                  <div className="mt-2 banner-error">
                    {getBookingRejectionMessage(updateMutation.error)}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
