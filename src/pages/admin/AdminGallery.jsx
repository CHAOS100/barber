import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Plus, Trash2, Star, EyeOff, Eye, Upload } from 'lucide-react';
import { localDb, localFiles } from '@/lib/localData';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MOCK_GALLERY } from '../../lib/mockData';
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
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newCategory, setNewCategory] = useState('haircuts');
  const [uploading, setUploading] = useState(false);

  const { data: photos = [] } = useQuery({
    queryKey: ['gallery'],
    queryFn: async () => {
      try {
        const r = await localDb.GalleryPhoto.list('sort_order');
        return r.length > 0 ? r : MOCK_GALLERY;
      } catch { return MOCK_GALLERY; }
    },
  });

  const addMutation = useMutation({
    mutationFn: (/** @type {any} */ data) => localDb.GalleryPhoto.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gallery'] }); setShowAdd(false); setNewUrl(''); },
  });

  const deleteMutation = useMutation({
    mutationFn: (/** @type {any} */ id) => localDb.GalleryPhoto.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gallery'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: (/** @type {any} */ { id, field, value }) => localDb.GalleryPhoto.update(id, { [field]: value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gallery'] }),
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { fileUrl } = await localFiles.upload(file);
      setNewUrl(fileUrl);
    } catch (err) {
      console.error(err);
    }
    setUploading(false);
  };

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
                  onClick={() => toggleMutation.mutate({ id: photo.id, field: 'is_featured', value: !photo.is_featured })}
                  className={`p-1.5 rounded-lg ${photo.is_featured ? 'bg-primary text-black' : 'glass'}`}
                >
                  <Star className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => toggleMutation.mutate({ id: photo.id, field: 'is_hidden', value: !photo.is_hidden })}
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
                  <label className="text-xs text-muted-foreground mb-1 block">העלה תמונה</label>
                  <label className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl py-6 cursor-pointer hover:border-primary transition-colors">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <span className="text-muted-foreground text-sm">{uploading ? 'מעלה...' : 'לחץ לבחירת קובץ'}</span>
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">או הכנס URL</label>
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
                onClick={() => addMutation.mutate({ url: newUrl, category: newCategory, is_featured: false, is_hidden: false })}
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
