import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Plus, Trash2, Star, EyeOff, Eye } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import {
  createGalleryPhoto,
  deleteGalleryPhoto,
  updateGalleryPhoto,
} from '@/lib/galleryFirestore';
import { useAdminGalleryRealtime } from '@/hooks/useGalleryRealtime';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { toast } from '@/components/ui/use-toast';
import GoldButton from '../../components/ui/GoldButton';

const CATEGORIES = [
  { key: 'haircuts', label: 'תספורות' },
  { key: 'skin_fades', label: 'פייד' },
  { key: 'beard', label: 'זקן' },
  { key: 'before_after', label: 'לפני/אחרי' },
  { key: 'premium_styles', label: 'פרימיום' },
];

export default function AdminGallery() {
  const navigate = useNavigate();
  const { isAdmin } = useCurrentUser();
  const [showAdd, setShowAdd] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newCategory, setNewCategory] = useState('haircuts');
  const { photos, error } = useAdminGalleryRealtime(isAdmin);

  const addMutation = useMutation({
    mutationFn: createGalleryPhoto,
    onSuccess: () => {
      toast({ title: 'התמונה נוספה ל-Firestore' });
      setShowAdd(false);
      setNewUrl('');
    },
    onError: (mutationError) => toast({ variant: 'destructive', title: 'הוספת התמונה נכשלה', description: mutationError?.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteGalleryPhoto,
    onSuccess: () => toast({ title: 'התמונה נמחקה' }),
    onError: (mutationError) => toast({ variant: 'destructive', title: 'מחיקת התמונה נכשלה', description: mutationError?.message }),
  });

  const toggleMutation = useMutation({
    mutationFn: (/** @type {any} */ { id, changes }) => updateGalleryPhoto(id, changes),
    onSuccess: () => toast({ title: 'התמונה עודכנה' }),
    onError: (mutationError) => toast({ variant: 'destructive', title: 'עדכון התמונה נכשל', description: mutationError?.message }),
  });

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky top-0 z-30 glass border-b border-white/10 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/admin')} className="press-scale">
          <ArrowRight className="w-6 h-6" />
        </button>
        <h1 className="font-black text-lg">ניהול גלריה</h1>
        <button onClick={() => setShowAdd(true)} className="mr-auto glass-gold p-2.5 rounded-xl">
          <Plus className="w-5 h-5 text-primary" />
        </button>
      </div>

      <div className="px-4 py-4">
        {error && <div className="mb-3 text-red-400 text-sm">טעינת הגלריה מ-Firestore נכשלה.</div>}
        {photos.length === 0 && <div className="glass rounded-2xl p-8 text-center text-muted-foreground text-sm">אין תמונות בגלריה.</div>}
        <div className="grid grid-cols-2 gap-3">
          {photos.map((photo, i) => (
            <motion.div
              key={photo.id || i}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04 }}
              className="relative group"
            >
              <div className={`aspect-square rounded-2xl overflow-hidden ${photo.is_hidden ? 'opacity-40' : ''}`}>
                <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
              </div>
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => toggleMutation.mutate({ id: photo.id, changes: { featured: !photo.is_featured } })}
                  className={`p-1.5 rounded-lg ${photo.is_featured ? 'bg-primary text-black' : 'glass'}`}
                >
                  <Star className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => toggleMutation.mutate({ id: photo.id, changes: { hidden: !photo.is_hidden } })}
                  className="glass p-1.5 rounded-lg"
                >
                  {photo.is_hidden ? <Eye className="w-3.5 h-3.5 text-green-400" /> : <EyeOff className="w-3.5 h-3.5 text-yellow-400" />}
                </button>
                <button
                  onClick={() => deleteMutation.mutate(photo.id)}
                  className="glass p-1.5 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
              {photo.is_featured && (
                <div className="absolute bottom-2 right-2 gold-gradient text-black text-xs font-bold px-2 py-0.5 rounded-full">⭐ מוצג</div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Add Photo Modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="keyboard-safe-overlay fixed inset-0 z-50 bg-black/80 flex items-end justify-center px-4 pb-8"
            onClick={() => setShowAdd(false)}
          >
            <motion.div
              initial={{ y: 200 }}
              animate={{ y: 0 }}
              exit={{ y: 200 }}
              className="dark-card rounded-3xl p-5 w-full max-w-sm"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="font-black text-lg mb-4">הוסף תמונה</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">כתובת תמונה (URL)</label>
                  <input
                    value={newUrl}
                    onChange={e => setNewUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary text-left"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">קטגוריה</label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat.key}
                        onClick={() => setNewCategory(cat.key)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                          newCategory === cat.key ? 'gold-gradient text-black' : 'glass text-muted-foreground'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <GoldButton
                onClick={() => addMutation.mutate({ url: newUrl, category: newCategory })}
                size="lg"
                className="w-full mt-4"
                disabled={!newUrl}
              >
                הוסף תמונה
              </GoldButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
