import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Archive, Edit3, Instagram, Plus, Trash2, User, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  archiveBarber,
  deleteBarber,
  saveBarber,
  uploadBarberPhoto,
} from '@/lib/businessFirestore';
import GoldButton from '@/components/ui/GoldButton';
import { toast } from '@/components/ui/use-toast';
import { useAllBarbersRealtime } from '@/hooks/useBookingData';
import { DATA_LOAD_ERROR_MESSAGE, getUserFacingErrorMessage } from '@/lib/userFacingErrors';
import AdminImageUploadButton from '@/components/admin/AdminImageUploadButton';

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const ALLOWED_PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];

const emptyBarber = {
  name: '',
  photo_url: '',
  instagramUrl: '',
  specialties: '',
  is_active: true,
  archived: false,
  sort_order: 0,
};

export default function AdminBarbers() {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyBarber);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoProgress, setPhotoProgress] = useState(0);
  const { data: barbers, error: barbersError } = useAllBarbersRealtime();

  const saveMutation = useMutation({
    mutationFn: () => saveBarber(editing?.id, form),
    onSuccess: () => {
      setEditing(null);
      toast({ title: editing?.id ? 'הספר עודכן' : 'הספר נוסף', description: 'רשימת הצוות עודכנה בהצלחה.' });
    },
    onError: (error) => toast({ variant: 'destructive', title: 'שמירת הספר נכשלה', description: getUserFacingErrorMessage(error) }),
  });
  const archiveMutation = useMutation({
    mutationFn: archiveBarber,
    onSuccess: () => {
      toast({ title: 'הספר הועבר לארכיון' });
    },
    onError: (error) => toast({ variant: 'destructive', title: 'העברה לארכיון נכשלה', description: getUserFacingErrorMessage(error) }),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteBarber,
    onSuccess: () => {
      toast({ title: 'הספר נמחק' });
    },
    onError: (error) => toast({ variant: 'destructive', title: 'מחיקת הספר נכשלה', description: getUserFacingErrorMessage(error) }),
  });

  const openEditor = (barber = null) => {
    setForm(barber ? {
      ...barber,
      specialties: barber.specialties?.join(', ') || '',
      instagramUrl: barber.instagram_url || barber.instagramUrl || '',
    } : emptyBarber);
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoProgress(0);
    setEditing(barber || { isNew: true });
  };

  const handlePhotoSelect = (file) => {
    if (!file) return;
    const extension = String(file.name || '').split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_PHOTO_TYPES.includes(file.type) && !ALLOWED_PHOTO_EXTENSIONS.includes(extension)) {
      toast({ variant: 'destructive', title: 'סוג קובץ לא נתמך', description: 'יש לבחור תמונת JPG, PNG, WEBP או HEIC' });
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast({ variant: 'destructive', title: 'הקובץ גדול מדי', description: 'גודל מרבי: 8MB' });
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSaveWithPhoto = async () => {
    if (!editing) return;
    setPhotoUploading(true);
    try {
      let savedId = editing.id;
      if (!savedId || editing.isNew) {
        savedId = await saveBarber(undefined, form);
      } else {
        await saveBarber(savedId, form);
      }
      if (photoFile && savedId) {
        await uploadBarberPhoto(savedId, photoFile, setPhotoProgress);
      }
      setEditing(null);
      toast({ title: editing.isNew ? 'הספר נוסף' : 'הספר עודכן', description: 'רשימת הצוות עודכנה בהצלחה.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'שמירת הספר נכשלה', description: getUserFacingErrorMessage(error) });
    } finally {
      setPhotoUploading(false);
      setPhotoProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky-top-safe z-30 glass border-b border-white/10 px-4 py-4 flex items-center gap-3">
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
            {DATA_LOAD_ERROR_MESSAGE}
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
            className="keyboard-safe-overlay fixed inset-0 z-[200] bg-black/80 flex items-center justify-center"
            onClick={() => setEditing(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="keyboard-safe-modal dark-card rounded-3xl w-full max-w-sm"
              onClick={event => event.stopPropagation()}
            >
              {/* Fixed header — always visible */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
                <h3 className="font-black text-lg">{editing.isNew ? 'ספר חדש' : 'עריכת ספר'}</h3>
                <button onClick={() => setEditing(null)} className="glass p-2 rounded-xl press-scale"><X className="w-4 h-4" /></button>
              </div>

              {/* Scrollable form body */}
              <div className="modal-scroll-body px-5">
                <div className="space-y-3 pb-1">
                  {/* Photo upload */}
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-border bg-secondary flex items-center justify-center">
                      {(photoPreview || form.photo_url) ? (
                        <img
                          src={photoPreview || form.photo_url}
                          alt="תמונת ספר"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-8 h-8 text-primary" />
                      )}
                    </div>
                    <AdminImageUploadButton
                      context="barber-photo"
                      disabled={photoUploading}
                      isUploading={photoUploading}
                      loadingLabel={`מעלה תמונה... ${photoProgress}%`}
                      accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
                      label={photoFile ? photoFile.name : 'בחר תמונת ספר'}
                      description="JPG, PNG, WEBP או HEIC עד 8MB"
                      onFileSelected={handlePhotoSelect}
                      className="w-full"
                    />
                    {photoFile && (
                      <p className="text-xs text-primary text-center">{photoFile.name}</p>
                    )}
                    {photoUploading && (
                      <div className="w-full bg-secondary rounded-full h-1.5">
                        <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${photoProgress}%` }} />
                      </div>
                    )}
                  </div>
                  <label className="block text-xs text-muted-foreground">שם
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </label>
                  <label className="block text-xs text-muted-foreground">כתובת תמונה (URL, אופציונלי)
                    <input value={form.photo_url || ''} onChange={e => setForm({ ...form, photo_url: e.target.value })} dir="ltr" className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="https://..." />
                  </label>
                  <label className="block text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Instagram className="w-3.5 h-3.5" /> אינסטגרם (URL, אופציונלי)</span>
                    <input value={form.instagramUrl || ''} onChange={e => setForm({ ...form, instagramUrl: e.target.value })} dir="ltr" className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="https://www.instagram.com/ost.cuts?igsh=bWlmdXN5NzNvaTc4" />
                  </label>
                  <label className="block text-xs text-muted-foreground">התמחויות, מופרדות בפסיק
                    <input value={form.specialties} onChange={e => setForm({ ...form, specialties: e.target.value })} className="mt-1 w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm" />
                  </label>
                  <label className="flex items-center justify-between">
                    <span className="text-sm">פעיל ומוצג ללקוחות</span>
                    <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked, archived: false })} className="accent-primary w-5 h-5" />
                  </label>
                </div>
              </div>

              {/* Save button always pinned at bottom */}
              <div className="modal-actions px-5">
                <GoldButton
                  onClick={handleSaveWithPhoto}
                  disabled={photoUploading || !form.name.trim()}
                  className="w-full"
                >
                  {photoUploading ? `מעלה תמונה... ${photoProgress}%` : 'שמור'}
                </GoldButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
