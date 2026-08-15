import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Edit3,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import {
  createGalleryPhoto,
  deleteGalleryPhoto,
  getGalleryUploadErrorMessage,
  replaceGalleryImage,
  updateGalleryPhoto,
  uploadGalleryImage,
  validateGalleryImageFile,
} from '@/lib/galleryFirestore';
import { useAdminGalleryRealtime } from '@/hooks/useGalleryRealtime';
import { useAllBarbersRealtime, useAllServicesRealtime } from '@/hooks/useBookingData';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { toast } from '@/components/ui/use-toast';
import GoldButton from '../../components/ui/GoldButton';
import { DATA_LOAD_ERROR_MESSAGE, getUserFacingErrorMessage } from '@/lib/userFacingErrors';
import AdminImageUploadButton, { AdminCameraUploadButton } from '@/components/admin/AdminImageUploadButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ModalActions, ModalBody, ModalHeader, ModalShell } from '@/components/ui/ModalShell';

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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [photoToDelete, setPhotoToDelete] = useState(null);
  const { photos, error } = useAdminGalleryRealtime(isAdmin);
  const { data: services } = useAllServicesRealtime();
  const { data: barbers } = useAllBarbersRealtime();

  const closeEditor = () => {
    setEditing(null);
    setForm(emptyForm);
    setFile(null);
    setUploadProgress(0);
    setUploadError('');
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
    setUploadProgress(0);
    setUploadError('');
  };

  const handleFileSelected = (selectedFile) => {
    setUploadError('');
    setUploadProgress(0);
    if (!selectedFile) {
      setFile(null);
      return;
    }

    try {
      validateGalleryImageFile(selectedFile);
      setFile(selectedFile);
    } catch (fileError) {
      setFile(null);
      setUploadError(getGalleryUploadErrorMessage(fileError));
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing?.id) {
        if (file) return replaceGalleryImage(editing, file, form, { onProgress: setUploadProgress });
        return updateGalleryPhoto(editing.id, form);
      }
      if (file) return uploadGalleryImage(file, form, { onProgress: setUploadProgress });
      return createGalleryPhoto(form);
    },
    onMutate: () => {
      setUploadError('');
      if (file) setUploadProgress(0);
    },
    onSuccess: (result) => {
      toast({ title: editing?.id ? 'התמונה עודכנה' : 'התמונה נוספה לגלריה' });
      closeEditor();
    },
    onError: (mutationError) => {
      const message = file
        ? getGalleryUploadErrorMessage(mutationError)
        : getUserFacingErrorMessage(mutationError);
      setUploadError(message);
      setUploadProgress(0);
      toast({
        variant: 'destructive',
        title: file ? 'העלאת התמונה נכשלה' : 'שמירת התמונה נכשלה',
        description: message,
      });
    },
    onSettled: () => {
      if (!file) setUploadProgress(0);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteGalleryPhoto,
    onSuccess: () => {
      setPhotoToDelete(null);
      toast({ title: 'התמונה נמחקה' });
    },
    onError: (mutationError) => toast({
      variant: 'destructive',
      title: 'מחיקת התמונה נכשלה',
      description: getUserFacingErrorMessage(mutationError),
    }),
  });

  const toggleMutation = useMutation({
    mutationFn: (/** @type {{ id: string, active: boolean }} */ { id, active }) =>
      updateGalleryPhoto(id, { active }),
    onSuccess: () => toast({ title: 'סטטוס התמונה עודכן' }),
    onError: (mutationError) => toast({
      variant: 'destructive',
      title: 'עדכון התמונה נכשל',
      description: getUserFacingErrorMessage(mutationError),
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
  const saveButtonText = saveMutation.isPending
    ? (file ? `מעלה ${uploadProgress}%` : 'שומר...')
    : 'שמור תמונה';

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky-top-safe z-[var(--z-sticky-nav)] glass border-b border-white/10 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/admin')} className="icon-btn press-scale -mr-2" aria-label="חזרה לניהול">
          <ArrowRight className="w-6 h-6" />
        </button>
        <div>
          <h1 className="font-black text-lg">ניהול תמונות</h1>
          <p className="text-muted-foreground text-xs">{photos.length} תמונות</p>
        </div>
        <button onClick={() => openEditor()} className="mr-auto glass-gold px-3 py-2.5 rounded-xl inline-flex items-center gap-2 press-scale">
          <Plus className="w-5 h-5 text-primary" />
          <span className="text-xs font-black text-primary">הוסף תמונה</span>
        </button>
      </div>

      <div className="px-4 py-4">
        {error && (
          <div className="mb-3 banner-error">
            {DATA_LOAD_ERROR_MESSAGE}
          </div>
        )}
        {photos.length === 0 && (
          <div className="glass premium-empty-state rounded-2xl p-8 text-center">
            <Plus className="w-10 h-10 text-muted-foreground/60 mx-auto mb-3" />
            <p className="font-black text-sm mb-1">אין תמונות בגלריה</p>
            <p className="text-muted-foreground text-xs">ניתן להעלות את התמונה הראשונה.</p>
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
                    disabled={toggleMutation.isPending && toggleMutation.variables?.id === photo.id}
                    className="glass p-2 rounded-lg disabled:cursor-wait disabled:opacity-50"
                    aria-label={photo.active ? 'הסתר תמונה' : 'הצג תמונה'}
                  >
                    {photo.active
                      ? <EyeOff className="w-4 h-4 text-yellow-400" />
                      : <Eye className="w-4 h-4 text-green-400" />}
                  </button>
                  <button
                    onClick={() => setPhotoToDelete(photo)}
                    disabled={deleteMutation.isPending}
                    className="glass p-2 rounded-lg disabled:cursor-wait disabled:opacity-50"
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

      <ModalShell
        open={Boolean(editing)}
        onClose={closeEditor}
        label={editing?.id ? 'עריכת תמונה' : 'הוספת תמונה'}
        closeOnBackdrop={false}
        closeOnEscape={false}
        busy={saveMutation.isPending}
        className="dark-card max-w-md rounded-3xl"
      >
        <ModalHeader
          title={editing?.id ? 'עריכת תמונה' : 'הוספת תמונה'}
          onClose={closeEditor}
          busy={saveMutation.isPending}
        />

              <ModalBody>
                <div className="space-y-3 pb-1">
                  {previewUrl && (
                    <img src={previewUrl} alt="תצוגה מקדימה" className="w-full h-44 object-cover rounded-2xl" />
                  )}

                  <AdminImageUploadButton
                    context="gallery-file"
                    disabled={saveMutation.isPending}
                    label={file ? file.name : 'בחר תמונה מהמכשיר'}
                    description="JPG, PNG או WEBP עד 10MB"
                    onFileSelected={handleFileSelected}
                  />

                  <AdminCameraUploadButton
                    context="gallery-camera"
                    disabled={saveMutation.isPending}
                    label="צלם תמונה במצלמה"
                    description="פתיחת המצלמה במכשירים תומכים"
                    onFileSelected={handleFileSelected}
                  />

                  {(saveMutation.isPending && file) && (
                    <div className="rounded-xl bg-secondary p-3">
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="text-muted-foreground">מעלה תמונה</span>
                        <span className="font-bold text-primary">{uploadProgress}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-background overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-200"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {uploadError && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-center">
                      <p className="text-red-400 text-sm font-bold">{uploadError}</p>
                      {canSave && !saveMutation.isPending && (
                        <button
                          type="button"
                          onClick={() => saveMutation.mutate()}
                          className="mt-2 text-primary text-sm font-bold"
                        >
                          נסה שוב
                        </button>
                      )}
                    </div>
                  )}

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
              </ModalBody>

              <ModalActions>
                <GoldButton
                  onClick={() => saveMutation.mutate()}
                  size="lg"
                  className="w-full"
                  disabled={!canSave || saveMutation.isPending}
                >
                  {saveButtonText}
                </GoldButton>
              </ModalActions>
      </ModalShell>

      <ConfirmDialog
        open={Boolean(photoToDelete)}
        title="מחיקת תמונה"
        description={`למחוק את התמונה ${photoToDelete?.title ? `„${photoToDelete.title}”` : ''} לצמיתות? הפעולה אינה ניתנת לביטול.`}
        confirmLabel="מחק תמונה"
        onClose={() => setPhotoToDelete(null)}
        onConfirm={() => photoToDelete && deleteMutation.mutate(photoToDelete)}
        busy={deleteMutation.isPending}
      />
    </div>
  );
}
