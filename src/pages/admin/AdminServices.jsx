import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Plus, Edit3, Trash2, X, Scissors } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { deleteService, saveService } from '@/lib/businessFirestore';
import GoldButton from '../../components/ui/GoldButton';
import { useAllServicesRealtime } from '@/hooks/useBookingData';
import { toast } from '@/components/ui/use-toast';
import { DATA_LOAD_ERROR_MESSAGE, getUserFacingErrorMessage } from '@/lib/userFacingErrors';

const emptyService = {
  name: '',
  description: '',
  price: '',
  duration: '',
  bufferBeforeMinutes: '',
  bufferAfterMinutes: '',
  is_active: true,
  category: '',
};

export default function AdminServices() {
  const navigate = useNavigate();
  const [editModal, setEditModal] = useState(null);
  const [form, setForm] = useState(emptyService);
  const [validationError, setValidationError] = useState('');

  const { data: services, error: servicesError } = useAllServicesRealtime();

  const saveMutation = useMutation({
    mutationFn: (/** @type {any} */ data) => saveService(editModal?.id, data),
    onSuccess: (_, variables) => {
      toast({
        title: editModal?.id ? 'השירות עודכן' : 'השירות נוסף',
        description: `${variables.name} נשמר בהצלחה.`,
      });
      setEditModal(null);
    },
    onError: (error) => toast({
      variant: 'destructive',
      title: 'שמירת השירות נכשלה',
      description: getUserFacingErrorMessage(error),
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteService,
    onSuccess: () => toast({ title: 'השירות נמחק', description: 'הרשימה עודכנה בזמן אמת.' }),
    onError: (error) => toast({ variant: 'destructive', title: 'מחיקת השירות נכשלה', description: getUserFacingErrorMessage(error) }),
  });

  const toggleMutation = useMutation({
    mutationFn: (/** @type {any} */ { id, is_active }) => saveService(id, { ...services.find(s => s.id === id), is_active }),
    onSuccess: () => toast({ title: 'סטטוס השירות עודכן' }),
    onError: (error) => toast({ variant: 'destructive', title: 'עדכון השירות נכשל', description: getUserFacingErrorMessage(error) }),
  });

  const openEdit = (service = null) => {
    setForm(service || emptyService);
    setValidationError('');
    saveMutation.reset();
    setEditModal(service || { isNew: true });
  };

  const handleSave = () => {
    if (!String(form.name || '').trim()) {
      setValidationError('שם השירות הוא שדה חובה.');
      return;
    }
    if (!Number(form.price) || Number(form.price) <= 0) {
      setValidationError('מחיר השירות הוא שדה חובה וחייב להיות גדול מאפס.');
      return;
    }
    if (!Number(form.duration) || Number(form.duration) <= 0) {
      setValidationError('משך השירות הוא שדה חובה וחייב להיות גדול מאפס.');
      return;
    }
    setValidationError('');
    saveMutation.mutate({
      ...form,
      price: Number(form.price),
      duration: Number(form.duration),
      bufferBeforeMinutes: form.bufferBeforeMinutes === '' || form.bufferBeforeMinutes === null
        ? null
        : Number(form.bufferBeforeMinutes),
      bufferAfterMinutes: form.bufferAfterMinutes === '' || form.bufferAfterMinutes === null
        ? null
        : Number(form.bufferAfterMinutes),
    });
  };

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky top-0 z-30 glass border-b border-white/10 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/admin')} className="press-scale">
          <ArrowRight className="w-6 h-6" />
        </button>
        <h1 className="font-black text-lg">ניהול שירותים</h1>
        <button onClick={() => openEdit()} className="mr-auto glass-gold p-2.5 rounded-xl">
          <Plus className="w-5 h-5 text-primary" />
        </button>
      </div>

      <div className="px-4 py-4 space-y-3">
        {servicesError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-red-400 text-sm">
            {DATA_LOAD_ERROR_MESSAGE}
          </div>
        )}
        {services.map((service, i) => (
          <motion.div
            key={service.id || i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`dark-card rounded-2xl p-4 ${!service.is_active ? 'opacity-50' : ''}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 glass-gold rounded-xl flex items-center justify-center">
                <Scissors className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold">{service.name}</span>
                  {!service.is_active && <span className="text-xs text-muted-foreground glass px-2 py-0.5 rounded-full">לא פעיל</span>}
                </div>
                <div className="text-muted-foreground text-xs mt-0.5">{service.description}</div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-primary font-black">₪{service.price}</span>
                  <span className="text-muted-foreground text-xs">{service.duration} דק'</span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => openEdit(service)} className="glass p-2 rounded-lg">
                  <Edit3 className="w-4 h-4 text-primary" />
                </button>
                <button
                  onClick={() => toggleMutation.mutate({ id: service.id, is_active: !service.is_active })}
                  className="glass p-2 rounded-lg"
                >
                  <div className={`w-4 h-4 rounded-full border-2 ${service.is_active ? 'border-green-400 bg-green-400' : 'border-muted'}`} />
                </button>
                <button onClick={() => window.confirm('למחוק את השירות?') && deleteMutation.mutate(service.id)} className="glass p-2 rounded-lg">
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {editModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="keyboard-safe-overlay fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
            onClick={() => setEditModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="keyboard-safe-modal dark-card rounded-3xl p-5 w-full max-w-sm overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-lg">{editModal.isNew ? 'שירות חדש' : 'עריכת שירות'}</h3>
                <button onClick={() => setEditModal(null)} className="glass p-2 rounded-xl">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                {[
                  { field: 'name', label: 'שם השירות', placeholder: 'תספורת רגילה', type: 'text' },
                  { field: 'description', label: 'תיאור', placeholder: 'תיאור קצר...', type: 'text' },
                  { field: 'price', label: 'מחיר (₪)', placeholder: '60', type: 'number' },
                  { field: 'duration', label: 'משך (דקות)', placeholder: '30', type: 'number' },
                  { field: 'category', label: 'קטגוריה', placeholder: 'תספורת', type: 'text' },
                  { field: 'bufferBeforeMinutes', label: 'מרווח לפני השירות (דקות)', placeholder: 'לפי ברירת מחדל', type: 'number' },
                  { field: 'bufferAfterMinutes', label: 'מרווח אחרי השירות (דקות)', placeholder: 'לפי ברירת מחדל', type: 'number' },
                ].map(({ field, label, placeholder, type }) => (
                  <div key={field}>
                    <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
                    <input
                      type={type}
                      value={form[field] || ''}
                      onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
                      placeholder={placeholder}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-right focus:outline-none focus:border-primary text-sm"
                      dir="rtl"
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">שירות פעיל</span>
                  <button
                    onClick={() => setForm(prev => ({ ...prev, is_active: !prev.is_active }))}
                    className={`w-12 h-6 rounded-full transition-all duration-200 relative ${form.is_active ? 'gold-gradient' : 'bg-secondary'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-all duration-200 ${form.is_active ? 'right-0.5' : 'left-0.5'}`} />
                  </button>
                </div>
              </div>
              {(validationError || saveMutation.error) && (
                <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-400 text-sm">
                  {validationError || getUserFacingErrorMessage(saveMutation.error)}
                </div>
              )}
              <GoldButton
                onClick={handleSave}
                disabled={saveMutation.isPending}
                size="lg"
                className="w-full mt-4"
              >
                {saveMutation.isPending ? 'שומר...' : editModal.isNew ? 'צור שירות' : 'שמור שינויים'}
              </GoldButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
