import React, { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Archive, Edit3, Instagram, Plus, RotateCcw, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  callDeactivateBarber,
  callSetBarberLifecycle,
  saveBarber,
  uploadBarberPhoto,
  isBarberBookable,
} from '@/lib/businessFirestore';
import GoldButton from '@/components/ui/GoldButton';
import { toast } from '@/components/ui/use-toast';
import { useAllBarbersRealtime } from '@/hooks/useBookingData';
import { DATA_LOAD_ERROR_MESSAGE, getUserFacingErrorMessage } from '@/lib/userFacingErrors';
import AdminImageUploadButton from '@/components/admin/AdminImageUploadButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ModalActions, ModalBody, ModalHeader, ModalShell } from '@/components/ui/ModalShell';

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
  const [deactivatingBarber, setDeactivatingBarber] = useState(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivateReasonError, setDeactivateReasonError] = useState('');
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [barberToArchive, setBarberToArchive] = useState(null);
  const { data: barbers, error: barbersError } = useAllBarbersRealtime();

  const archiveMutation = useMutation({
    mutationFn: (barberId) => callSetBarberLifecycle({ barberId, action: 'archive' }),
    onSuccess: () => {
      setBarberToArchive(null);
      toast({ title: 'הספר הועבר לארכיון' });
    },
    onError: (error) => toast({ variant: 'destructive', title: 'העברה לארכיון נכשלה', description: getUserFacingErrorMessage(error) }),
  });
  const activateMutation = useMutation({
    mutationFn: (barber) => callSetBarberLifecycle({ barberId: barber.id, action: 'activate' }),
    onSuccess: () => toast({ title: 'הספר הופעל מחדש' }),
    onError: (error) => toast({ variant: 'destructive', title: 'הפעלת הספר נכשלה', description: getUserFacingErrorMessage(error) }),
  });
  const restoreMutation = useMutation({
    mutationFn: (barber) => callSetBarberLifecycle({ barberId: barber.id, action: 'restore' }),
    onSuccess: () => toast({ title: 'הספר הוחזר מהארכיון', description: 'הספר נשאר לא פעיל עד להפעלה מפורשת.' }),
    onError: (error) => toast({ variant: 'destructive', title: 'השחזור נכשל', description: getUserFacingErrorMessage(error) }),
  });

  const handleDeactivateConfirm = async () => {
    if (!deactivatingBarber || deactivateLoading) return;
    if (!deactivateReason.trim()) {
      setDeactivateReasonError('חובה להזין סיבה לביטול זמינות הספר');
      return;
    }
    setDeactivateReasonError('');
    setDeactivateLoading(true);
    try {
      const result = await callDeactivateBarber({ barberId: deactivatingBarber.id, reason: deactivateReason.trim() });
      const cancelled = result?.appointmentsCancelled ?? 0;
      toast({
        title: 'הספר הוסר מהזמנות',
        description: cancelled > 0
          ? `${cancelled} תורים עתידיים בוטלו והלקוחות קיבלו הודעה.`
          : 'לא היו תורים עתידיים לביטול.',
      });
      setDeactivatingBarber(null);
      setDeactivateReason('');
    } catch (error) {
      toast({ variant: 'destructive', title: 'הסרת הספר נכשלה', description: getUserFacingErrorMessage(error) });
    } finally {
      setDeactivateLoading(false);
    }
  };

  const togglingBarberId = activateMutation.isPending
    ? activateMutation.variables?.id
    : restoreMutation.isPending
      ? restoreMutation.variables?.id
      : null;

  useEffect(() => {
    if (!photoPreview) return undefined;
    return () => URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const closeEditor = () => {
    setEditing(null);
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoProgress(0);
  };

  const closeDeactivation = () => {
    if (deactivateLoading) return;
    setDeactivatingBarber(null);
    setDeactivateReason('');
    setDeactivateReasonError('');
  };

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
    if (!editing || photoUploading) return;
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
      closeEditor();
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
      <div className="sticky-top-safe z-[var(--z-sticky-nav)] glass border-b border-white/10 px-4 py-3 flex items-center gap-1">
        <button onClick={() => navigate('/admin')} className="icon-btn press-scale -mr-2" aria-label="חזרה לניהול"><ArrowRight className="w-6 h-6" /></button>
        <div>
          <h1 className="font-black text-lg">ספרים / צוות</h1>
          <p className="text-muted-foreground text-xs">{barbers.filter(isBarberBookable).length} פעילים</p>
        </div>
        <button onClick={() => openEditor()} className="mr-auto icon-btn gold-gradient press-scale" aria-label="הוסף ספר">
          <Plus className="w-5 h-5 text-black" />
        </button>
      </div>

      <div className="px-4 py-4 space-y-3">
        {barbersError && (
          <div className="banner-error">
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
              <div className="mt-1.5">
                <span className={`status-pill ${barber.archived ? 'status-pill--neutral' : isBarberBookable(barber) ? 'status-pill--success' : 'status-pill--warning'}`}>
                  {barber.archived ? 'בארכיון' : isBarberBookable(barber) ? 'פעיל ומופיע בהזמנה' : 'לא פעיל'}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => openEditor(barber)} className="icon-btn glass press-scale" aria-label="עריכת ספר"><Edit3 className="w-4 h-4 text-primary" /></button>
              <button
                onClick={() => {
                  if (barber.archived) {
                    restoreMutation.mutate(barber);
                  } else if (isBarberBookable(barber)) {
                    setDeactivatingBarber(barber);
                    setDeactivateReason('');
                    setDeactivateReasonError('');
                  } else {
                    activateMutation.mutate(barber);
                  }
                }}
                disabled={togglingBarberId === barber.id || deactivateLoading}
                title={barber.archived ? 'החזר מהארכיון' : isBarberBookable(barber) ? 'הסר מהזמנות' : 'הפעל להזמנות'}
                className={`icon-btn glass press-scale px-2 text-[11px] font-bold disabled:opacity-40 ${isBarberBookable(barber) ? 'text-primary' : 'text-muted-foreground'}`}
              >
                {togglingBarberId === barber.id ? 'מעדכן...' : barber.archived ? <RotateCcw className="w-4 h-4" /> : isBarberBookable(barber) ? 'זמין' : 'לא זמין'}
              </button>
              <button
                onClick={() => setBarberToArchive(barber)}
                disabled={barber.archived || isBarberBookable(barber) || archiveMutation.isPending}
                className="icon-btn glass press-scale"
                title={isBarberBookable(barber) ? 'יש להסיר מהזמנות לפני העברה לארכיון' : 'העבר לארכיון'}
                aria-label="העבר לארכיון"
              ><Archive className="w-4 h-4 text-orange-400" /></button>
            </div>
          </div>
        ))}
        {barbers.length === 0 && (
          <div className="glass premium-empty-state rounded-2xl p-8 text-center">
            <User className="w-10 h-10 text-muted-foreground/60 mx-auto mb-3" />
            <p className="font-black text-sm mb-1">אין עדיין ספרים</p>
            <p className="text-muted-foreground text-xs">יש להוסיף ספר פעיל לפני שלקוחות יוכלו לקבוע תור.</p>
          </div>
        )}
      </div>

      <ModalShell
        open={Boolean(editing)}
        onClose={closeEditor}
        label={editing?.isNew ? 'ספר חדש' : 'עריכת ספר'}
        closeOnBackdrop={false}
        closeOnEscape={false}
        busy={photoUploading}
        className="dark-card max-w-sm rounded-3xl"
      >
        <ModalHeader title={editing?.isNew ? 'ספר חדש' : 'עריכת ספר'} onClose={closeEditor} busy={photoUploading} />

              <ModalBody>
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
                  {editing.isNew && <label className="flex items-center justify-between">
                    <span className="text-sm">פעיל ומוצג ללקוחות</span>
                    <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked, archived: false })} className="accent-primary w-5 h-5" />
                  </label>}
                </div>
              </ModalBody>

              <ModalActions>
                <GoldButton
                  onClick={handleSaveWithPhoto}
                  disabled={photoUploading || !form.name.trim()}
                  className="w-full"
                >
                  {photoUploading ? `מעלה תמונה... ${photoProgress}%` : 'שמור'}
                </GoldButton>
              </ModalActions>
      </ModalShell>

      {/* Deactivation reason modal */}
      <ModalShell
        open={Boolean(deactivatingBarber)}
        onClose={closeDeactivation}
        label="הסרת ספר מהזמנות"
        closeOnBackdrop={false}
        closeOnEscape={false}
        busy={deactivateLoading}
        level="confirmation"
        className="dark-card max-w-sm rounded-3xl"
      >
        <ModalHeader title="הסרה מהזמנות" onClose={closeDeactivation} busy={deactivateLoading} />
              {/* Scrollable body — grows to fill available space and scrolls if keyboard pushes it */}
              <ModalBody>
                <div className="space-y-4 pb-1">
                  <p className="text-muted-foreground text-sm leading-5">
                    פעולה זו תבטל את כל התורים העתידיים הפעילים של הספר ותשלח הודעה ללקוחות.
                  </p>
                  <p className="text-xs text-primary font-bold">ספר: {deactivatingBarber.name}</p>
                  <label className="block text-xs text-muted-foreground font-semibold">
                    סיבת הסרה — חובה (תישלח ללקוחות)
                    <textarea
                      value={deactivateReason}
                      onChange={e => {
                        setDeactivateReason(e.target.value);
                        if (e.target.value.trim()) setDeactivateReasonError('');
                      }}
                      placeholder="למשל: הספר יצא לחופשה"
                      rows={2}
                      dir="rtl"
                      className={`mt-1 w-full bg-secondary border rounded-xl px-3 py-2 text-sm text-right focus:outline-none focus:border-primary resize-none ${deactivateReasonError ? 'border-red-400' : 'border-border'}`}
                    />
                    {deactivateReasonError && (
                      <span className="text-red-400 text-xs mt-1 block">{deactivateReasonError}</span>
                    )}
                  </label>
                </div>
              </ModalBody>
              {/* Actions — always pinned above keyboard */}
              <ModalActions>
                <GoldButton
                  onClick={handleDeactivateConfirm}
                  disabled={deactivateLoading || !deactivateReason.trim()}
                  className="w-full"
                >
                  {deactivateLoading ? 'מעבד...' : 'הפוך ללא זמין ובטל תורים'}
                </GoldButton>
              </ModalActions>
      </ModalShell>

      <ConfirmDialog
        open={Boolean(barberToArchive)}
        title="העברת ספר לארכיון"
        description={`להעביר את ${barberToArchive?.name || 'הספר'} לארכיון? ניתן יהיה לשחזר אותו בהמשך.`}
        confirmLabel="העבר לארכיון"
        onClose={() => setBarberToArchive(null)}
        onConfirm={() => barberToArchive && archiveMutation.mutate(barberToArchive.id)}
        busy={archiveMutation.isPending}
        destructive={false}
      />
    </div>
  );
}
