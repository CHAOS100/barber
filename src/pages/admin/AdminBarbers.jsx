import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Archive, Edit3, Plus, Trash2, User, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  archiveBarber,
  deleteBarber,
  saveBarber,
} from '@/lib/businessFirestore';
import GoldButton from '@/components/ui/GoldButton';
import { toast } from '@/components/ui/use-toast';
import { useAllBarbersRealtime } from '@/hooks/useBookingData';

const emptyBarber = {
  name: '',
  photo_url: '',
  specialties: '',
  is_active: true,
  archived: false,
  sort_order: 0,
};

export default function AdminBarbers() {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyBarber);
  const { data: barbers, error: barbersError } = useAllBarbersRealtime();

  const saveMutation = useMutation({
    mutationFn: () => saveBarber(editing?.id, form),
    onSuccess: () => {
      setEditing(null);
      toast({ title: editing?.id ? 'הספר עודכן' : 'הספר נוסף', description: 'רשימת הצוות עודכנה ב-Firestore.' });
    },
    onError: (error) => toast({ variant: 'destructive', title: 'שמירת הספר נכשלה', description: error?.message }),
  });
  const archiveMutation = useMutation({
    mutationFn: archiveBarber,
    onSuccess: () => {
      toast({ title: 'הספר הועבר לארכיון' });
    },
    onError: (error) => toast({ variant: 'destructive', title: 'העברה לארכיון נכשלה', description: error?.message }),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteBarber,
    onSuccess: () => {
      toast({ title: 'הספר נמחק' });
    },
    onError: (error) => toast({ variant: 'destructive', title: 'מחיקת הספר נכשלה', description: error?.message }),
  });

  const openEditor = (barber = null) => {
    setForm(barber ? {
      ...barber,
      specialties: barber.specialties?.join(', ') || '',
    } : emptyBarber);
    setEditing(barber || { isNew: true });
  };

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky top-0 z-30 glass border-b border-white/10 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/admin')} className="press-scale"><ArrowRight className="w-6 h-6" /></button>
        <div>
          <h1 className="font-black text-lg">ספרים / צוות</h1>
          <p className="text-muted-foreground text-xs">{barbers.filter(b => b.is_active && !b.archived).length} פעילים</p>
        </div>
        <button onClick={() => openEditor()} className="mr-auto gold-gradient p-2.5 rounded-xl">
          <Plus className="w-4 h-4 text-black" />
        </button>
      </div>

      <div className="px-4 py-4 space-y-3">
        {barbersError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-red-400 text-sm">
            טעינת רשימת הספרים מ-Firestore נכשלה: {barbersError.message}
          </div>
        )}
        {barbers.map((barber) => (
          <div key={barber.id} className={`dark-card rounded-2xl p-4 flex items-center gap-3 ${barber.archived ? 'opacity-40' : ''}`}>
            {barber.photo_url ? (
              <img src={barber.photo_url} alt={barber.name} className="w-14 h-14 rounded-xl object-cover border border-primary" />
            ) : (
              <div className="w-14 h-14 glass-gold rounded-xl flex items-center justify-center"><User className="text-primary" /></div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-bold">{barber.name}</div>
              <div className="text-xs text-muted-foreground truncate">{barber.specialties?.join(' • ') || 'ללא התמחות מוגדרת'}</div>
              <div className={`text-xs mt-1 ${barber.is_active && !barber.archived ? 'text-green-400' : 'text-muted-foreground'}`}>
                {barber.is_active && !barber.archived ? 'פעיל ומופיע בהזמנה' : 'לא פעיל'}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <button onClick={() => openEditor(barber)} className="glass p-2 rounded-lg"><Edit3 className="w-4 h-4 text-primary" /></button>
              <button onClick={() => archiveMutation.mutate(barber.id)} className="glass p-2 rounded-lg"><Archive className="w-4 h-4 text-orange-400" /></button>
              <button
                onClick={() => window.confirm('למחוק את הספר לצמיתות?') && deleteMutation.mutate(barber.id)}
                className="glass p-2 rounded-lg"
              ><Trash2 className="w-4 h-4 text-red-400" /></button>
            </div>
          </div>
        ))}
        {barbers.length === 0 && (
          <div className="glass rounded-2xl p-6 text-center text-muted-foreground">
            יש להוסיף ספר פעיל לפני שלקוחות יוכלו לקבוע תור.
          </div>
        )}
      </div>

      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="keyboard-safe-overlay fixed inset-0 z-50 bg-black/80 flex items-end justify-center px-4 pb-8"
            onClick={() => setEditing(null)}
          >
            <motion.div
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              className="keyboard-safe-modal dark-card rounded-3xl p-5 w-full max-w-sm overflow-y-auto"
              onClick={event => event.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-lg">{editing.isNew ? 'ספר חדש' : 'עריכת ספר'}</h3>
                <button onClick={() => setEditing(null)} className="glass p-2 rounded-xl"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-3">
                <label className="block text-xs text-muted-foreground">שם
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm" />
                </label>
                <label className="block text-xs text-muted-foreground">כתובת תמונה
                  <input value={form.photo_url} onChange={e => setForm({ ...form, photo_url: e.target.value })} dir="ltr" className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm" />
                </label>
                <label className="block text-xs text-muted-foreground">התמחויות, מופרדות בפסיק
                  <input value={form.specialties} onChange={e => setForm({ ...form, specialties: e.target.value })} className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm" />
                </label>
                <label className="flex items-center justify-between">
                  <span className="text-sm">פעיל ומוצג ללקוחות</span>
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked, archived: false })} className="accent-primary w-5 h-5" />
                </label>
              </div>
              <GoldButton onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name.trim()} className="w-full mt-5">
                שמור
              </GoldButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
