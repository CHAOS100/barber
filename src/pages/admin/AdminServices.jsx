import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Plus, Edit3, Trash2, Scissors } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { deleteService, saveService } from '@/lib/businessFirestore';
import GoldButton from '../../components/ui/GoldButton';
import { useAllServicesRealtime } from '@/hooks/useBookingData';
import { toast } from '@/components/ui/use-toast';
import { DATA_LOAD_ERROR_MESSAGE, getUserFacingErrorMessage } from '@/lib/userFacingErrors';
import { formatILS } from '@/lib/formatters';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ModalActions, ModalBody, ModalHeader, ModalShell } from '@/components/ui/ModalShell';

const emptyService = {
  name: '',
  description: '',
  price: '',
  duration: '',
  is_active: true,
  category: '',
};

export default function AdminServices() {
  const navigate = useNavigate();
  const [editModal, setEditModal] = useState(null);
  const [form, setForm] = useState(emptyService);
  const [validationError, setValidationError] = useState('');
  const [serviceToDelete, setServiceToDelete] = useState(null);

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
    onSuccess: () => {
      setServiceToDelete(null);
      toast({ title: 'השירות נמחק', description: 'הרשימה עודכנה בזמן אמת.' });
    },
    onError: (error) => toast({ variant: 'destructive', title: 'מחיקת השירות נכשלה', description: getUserFacingErrorMessage(error) }),
  });

  const toggleMutation = useMutation({
    mutationFn: (/** @type {any} */ { id, is_active }) => {
      const svc = services.find(s => s.id === id);
      return saveService(id, { ...svc, active: is_active });
    },
    onSuccess: () => toast({ title: 'סטטוס השירות עודכן' }),
    onError: (error) => toast({ variant: 'destructive', title: 'עדכון השירות נכשל', description: getUserFacingErrorMessage(error) }),
  });

  const togglingServiceId = toggleMutation.isPending ? toggleMutation.variables?.id : null;

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
    if (!String(form.category || '').trim()) {
      setValidationError('קטגוריית השירות היא שדה חובה.');
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
      bufferBeforeMinutes: null,
      bufferAfterMinutes: null,
    });
  };

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky-top-safe z-[var(--z-sticky-nav)] glass border-b border-white/10 px-4 py-3 flex items-center gap-1">
        <button onClick={() => navigate('/admin')} className="icon-btn press-scale -mr-2" aria-label="חזרה לניהול">
          <ArrowRight className="w-6 h-6" />
        </button>
        <h1 className="font-black text-lg">ניהול שירותים</h1>
        <button onClick={() => openEdit()} className="mr-auto icon-btn glass-gold press-scale" aria-label="הוסף שירות">
          <Plus className="w-5 h-5 text-primary" />
        </button>
      </div>

      <div className="px-4 py-4 space-y-3">
        {servicesError && (
          <div className="banner-error">
            {DATA_LOAD_ERROR_MESSAGE}
          </div>
        )}
        {!servicesError && services.length === 0 && (
          <div className="glass premium-empty-state rounded-2xl p-8 text-center">
            <Scissors className="w-10 h-10 text-muted-foreground/60 mx-auto mb-3" />
            <p className="font-black text-sm mb-1">אין שירותים עדיין</p>
            <p className="text-muted-foreground text-xs">לחץ על הפלוס כדי ליצור שירות ראשון.</p>
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
                  {!service.is_active && <span className="status-pill status-pill--neutral">לא פעיל</span>}
                </div>
                <div className="text-muted-foreground text-xs mt-0.5">{service.description}</div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-primary font-black">{formatILS(service.price)}</span>
                  <span className="text-muted-foreground text-xs">{service.duration} דק'</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <button onClick={() => openEdit(service)} className="icon-btn glass press-scale" aria-label="עריכת שירות">
                  <Edit3 className="w-4 h-4 text-primary" />
                </button>
                <button
                  onClick={() => toggleMutation.mutate({ id: service.id, is_active: !service.is_active })}
                  disabled={togglingServiceId === service.id}
                  title={service.is_active ? 'הסתר מהזמנות' : 'החזר להזמנות'}
                  className={`icon-btn glass press-scale px-2 text-[11px] font-bold disabled:opacity-50 ${service.is_active ? 'text-primary' : 'text-muted-foreground'}`}
                >
                  {togglingServiceId === service.id ? 'מעדכן...' : service.is_active ? 'פעיל' : 'לא פעיל'}
                </button>
                <button onClick={() => setServiceToDelete(service)} disabled={deleteMutation.isPending} className="icon-btn glass press-scale disabled:opacity-50" aria-label="מחק שירות">
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <ModalShell
        open={Boolean(editModal)}
        onClose={() => setEditModal(null)}
        label={editModal?.isNew ? 'שירות חדש' : 'עריכת שירות'}
        closeOnBackdrop={false}
        closeOnEscape={false}
        busy={saveMutation.isPending}
        className="dark-card max-w-sm rounded-3xl"
      >
        <ModalHeader
          title={editModal?.isNew ? 'שירות חדש' : 'עריכת שירות'}
          onClose={() => setEditModal(null)}
          busy={saveMutation.isPending}
        />

              <ModalBody>
                <div className="space-y-3 pb-1">
                  {[
                    { field: 'name', label: 'שם השירות', placeholder: 'תספורת רגילה', type: 'text' },
                    { field: 'description', label: 'תיאור', placeholder: 'תיאור קצר...', type: 'text' },
                    { field: 'price', label: 'מחיר (₪)', placeholder: '60', type: 'number' },
                    { field: 'duration', label: 'משך (דקות)', placeholder: '30', type: 'number' },
                    { field: 'category', label: 'קטגוריה', placeholder: 'תספורת', type: 'text' },
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
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, is_active: !prev.is_active }))}
                      className={`w-12 h-6 rounded-full transition-all duration-200 relative ${form.is_active ? 'gold-gradient' : 'bg-secondary'}`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-all duration-200 ${form.is_active ? 'right-0.5' : 'left-0.5'}`} />
                    </button>
                  </div>
                  {(validationError || saveMutation.error) && (
                    <div className="banner-error">
                      {validationError || getUserFacingErrorMessage(saveMutation.error)}
                    </div>
                  )}
                </div>
              </ModalBody>

              <ModalActions>
                <GoldButton
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                  size="lg"
                  className="w-full"
                >
                  {saveMutation.isPending ? 'שומר...' : editModal.isNew ? 'צור שירות' : 'שמור שינויים'}
                </GoldButton>
              </ModalActions>
      </ModalShell>

      <ConfirmDialog
        open={Boolean(serviceToDelete)}
        title="מחיקת שירות"
        description={`למחוק את השירות ${serviceToDelete?.name || ''}? הפעולה אינה ניתנת לביטול.`}
        confirmLabel="מחק שירות"
        onClose={() => setServiceToDelete(null)}
        onConfirm={() => serviceToDelete && deleteMutation.mutate(serviceToDelete.id)}
        busy={deleteMutation.isPending}
      />
    </div>
  );
}
