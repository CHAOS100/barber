import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Edit3,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import {
  createGalleryPhoto,
  deleteGalleryPhoto,
  replaceGalleryImage,
  updateGalleryPhoto,
  uploadGalleryImage,
} from '@/lib/galleryFirestore';
import { useAdminGalleryRealtime } from '@/hooks/useGalleryRealtime';
import { useAllBarbersRealtime, useAllServicesRealtime } from '@/hooks/useBookingData';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { toast } from '@/components/ui/use-toast';
import GoldButton from '../../components/ui/GoldButton';

const CATEGORIES = [
  { key: 'gallery', label: 'גלריה / תיק עבודות' },
  { key: 'business', label: 'תמונות העסק' },
  { key: 'barber', label: 'ספרים / צוות' },
  { key: 'service', label: 'שירותים' },
];

const emptyForm = {
  imageUrl: '',
  title: '',
  description: '',
  category: 'gallery',
  serviceId: '',
  barberId: '',
  active: true,
};

export default function AdminGallery() {
  const navigate = useNavigate();
  const { isAdmin } = useCurrentUser();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const { photos, error } = useAdminGalleryRealtime(isAdmin);
  const { data: services } = useAllServicesRealtime();
  const { data: barbers } = useAllBarbersRealtime();

  const closeEditor = () => {
    setEditing(null);
    setForm(emptyForm);
    setFile(null);
  };

  const openEditor = (photo = null) => {
    setEditing(photo || { isNew: true });
    setForm(photo ? {
      imageUrl: photo.imageUrl || photo.url || '',
      title: photo.title || '',
      description: photo.description || '',
      category: photo.category || 'gallery',
      serviceId: photo.serviceId || '',
      barberId: photo.barberId || '',
      active: photo.active !== false,
    } : emptyForm);
    setFile(null);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing?.id) {
        if (file) return replaceGalleryImage(editing, file, form);
        return updateGalleryPhoto(editing.id, form);
      }
      if (file) return uploadGalleryImage(file, form);
      return createGalleryPhoto(form);
    },
    onSuccess: () => {
      toast({ title: editing?.id ? 'התמונה עודכנה' : 'התמונה נוספה לגלריה' });
      closeEditor();
    },
    onError: (mutationError) => toast({
      variant: 'destructive',
      title: 'שמירת התמונה נכשלה',
      description: mutationError?.message || 'יש לנסות שוב.',
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteGalleryPhoto,
    onSuccess: () => toast({ title: 'התמונה נמחקה' }),
    onError: (mutationError) => toast({
      variant: 'destructive',
      title: 'מחיקת התמונה נכשלה',
      description: mutationError?.message || 'יש לנסות שוב.',
    }),
  });

  const toggleMutation = useMutation({
    mutationFn: (/** @type {{ id: string, active: boolean }} */ { id, active }) =>
      updateGalleryPhoto(id, { active }),
    onSuccess: () => toast({ title: 'סטטוס התמונה עודכן' }),
    onError: (mutationError) => toast({
      variant: 'destructive',
      title: 'עדכון התמונה נכשל',
      description: mutationError?.message || 'יש לנסות שוב.',
    }),
  });

  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : form.imageUrl),
    [file, form.imageUrl],
  );
  useEffect(() => {
    if (!file || !previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [file, previewUrl]);
  const canSave = Boolean(file || form.imageUrl.trim());

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky top-0 z-30 glass border-b border-white/10 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/admin')} className="press-scale">
          <ArrowRight className="w-6 h-6" />
        </button>
        <div>
          <h1 className="font-black text-lg">ניהול תמונות</h1>
          <p className="text-muted-foreground text-xs">{photos.length} תמונות</p>
        </div>
        <button onClick={() => openEditor()} className="mr-auto glass-gold p-2.5 rounded-xl">
          <Plus className="w-5 h-5 text-primary" />
        </button>
      </div>

      <div className="px-4 py-4">
        {error && (
          <div className="mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-red-400 text-sm">
            טעינת הגלריה מ־Firestore נכשלה: {error.message}
          </div>
        )}
        {photos.length === 0 && (
          <div className="glass rounded-2xl p-8 text-center text-muted-foreground text-sm">
            אין תמונות בגלריה. ניתן להעלות את התמונה הראשונה.
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {photos.map((photo, index) => (
            <motion.div
              key={photo.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.04 }}
              className="dark-card rounded-2xl overflow-hidden"
            >
              <div className={`aspect-square overflow-hidden ${photo.active ? '' : 'opacity-40'}`}>
                <img
                  src={photo.imageUrl || photo.url}
                  alt={photo.title || ''}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="p-3">
                <div className="font-bold text-sm truncate">{photo.title || 'ללא כותרת'}</div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  {CATEGORIES.find((item) => item.key === photo.category)?.label || photo.category}
                </div>
                <div className="flex gap-1 mt-3">
                  <button onClick={() => openEditor(photo)} className="glass p-2 rounded-lg" aria-label="ערוך תמונה">
                    <Edit3 className="w-4 h-4 text-primary" />
                  </button>
                  <button
                    onClick={() => toggleMutation.mutate({ id: photo.id, active: !photo.active })}
                    className="glass p-2 rounded-lg"
                    aria-label={photo.active ? 'הסתר תמונה' : 'הצג תמונה'}
                  >
                    {photo.active
                      ? <EyeOff className="w-4 h-4 text-yellow-400" />
                      : <Eye className="w-4 h-4 text-green-400" />}
                  </button>
                  <button
                    onClick={() => window.confirm('למחוק את התמונה לצמיתות?') && deleteMutation.mutate(photo)}
                    className="glass p-2 rounded-lg"
                    aria-label="מחק תמונה"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="keyboard-safe-overlay fixed inset-0 z-50 bg-black/80 flex items-end justify-center px-4 pb-8"
            onClick={closeEditor}
          >
            <motion.div
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              className="keyboard-safe-modal dark-card rounded-3xl p-5 w-full max-w-md overflow-y-auto"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-lg">{editing.id ? 'עריכת תמונה' : 'הוספת תמונה'}</h3>
                <button onClick={closeEditor} className="glass p-2 rounded-xl">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {previewUrl && (
                <img src={previewUrl} alt="תצוגה מקדימה" className="w-full h-44 object-cover rounded-2xl mb-4" />
              )}

              <div className="space-y-3">
                <label className="block glass rounded-xl p-3 cursor-pointer text-center">
                  <Upload className="w-5 h-5 text-primary mx-auto mb-1" />
                  <span className="text-sm font-bold">{file ? file.name : 'בחר תמונה מהמכשיר'}</span>
                  <span className="block text-xs text-muted-foreground mt-1">תמונה בלבד, עד 10MB</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                  />
                </label>

                <label className="block text-xs text-muted-foreground">
                  או כתובת תמונה
                  <input
                    value={form.imageUrl}
                    onChange={(event) => setForm({ ...form, imageUrl: event.target.value })}
                    placeholder="https://..."
                    dir="ltr"
                    className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                  />
                </label>
                <label className="block text-xs text-muted-foreground">
                  כותרת
                  <input
                    value={form.title}
                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                    className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm"
                  />
                </label>
                <label className="block text-xs text-muted-foreground">
                  תיאור
                  <textarea
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                    className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm h-20 resize-none"
                  />
                </label>
                <label className="block text-xs text-muted-foreground">
                  קטגוריה
                  <select
                    value={form.category}
                    onChange={(event) => setForm({ ...form, category: event.target.value, serviceId: '', barberId: '' })}
                    className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm"
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category.key} value={category.key}>{category.label}</option>
                    ))}
                  </select>
                </label>
                {form.category === 'service' && (
                  <label className="block text-xs text-muted-foreground">
                    שירות משויך
                    <select
                      value={form.serviceId}
                      onChange={(event) => setForm({ ...form, serviceId: event.target.value })}
                      className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm"
                    >
                      <option value="">ללא שיוך</option>
                      {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                    </select>
                  </label>
                )}
                {form.category === 'barber' && (
                  <label className="block text-xs text-muted-foreground">
                    ספר משויך
                    <select
                      value={form.barberId}
                      onChange={(event) => setForm({ ...form, barberId: event.target.value })}
                      className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm"
                    >
                      <option value="">ללא שיוך</option>
                      {barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
                    </select>
                  </label>
                )}
                <label className="flex items-center justify-between text-sm">
                  <span>מוצג ללקוחות</span>
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(event) => setForm({ ...form, active: event.target.checked })}
                    className="accent-primary w-5 h-5"
                  />
                </label>
              </div>

              <GoldButton
                onClick={() => saveMutation.mutate()}
                size="lg"
                className="w-full mt-5"
                disabled={!canSave || saveMutation.isPending}
              >
                {saveMutation.isPending ? 'שומר...' : 'שמור תמונה'}
              </GoldButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
