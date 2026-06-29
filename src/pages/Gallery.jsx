import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Share2, ZoomIn } from 'lucide-react';
import { usePublishedGalleryRealtime } from '@/hooks/useGalleryRealtime';
import { DATA_LOAD_ERROR_MESSAGE } from '@/lib/userFacingErrors';

const CATEGORIES = [
  { key: 'all', label: 'הכל' },
  { key: 'gallery', label: 'תיק עבודות' },
  { key: 'business', label: 'העסק' },
  { key: 'barber', label: 'הצוות' },
  { key: 'service', label: 'שירותים' },
];

export default function Gallery() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedIndex, setSelectedIndex] = useState(null);

  const { photos: allPhotos, error } = usePublishedGalleryRealtime();
  const filtered = activeCategory === 'all'
    ? allPhotos.filter(p => !p.is_hidden)
    : allPhotos.filter(p => p.category === activeCategory && !p.is_hidden);

  const handlePrev = () => setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
  const handleNext = () => setSelectedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));

  const handleShare = async () => {
    if (navigator.share && filtered[selectedIndex]) {
      await navigator.share({ url: filtered[selectedIndex].imageUrl || filtered[selectedIndex].url });
    }
  };

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      {/* Header */}
      <div className="px-4 pt-12 pb-4">
        <h1 className="text-3xl font-black mb-1">גלריה</h1>
        <p className="text-muted-foreground text-sm">OST BARBER</p>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 px-4 overflow-x-auto pb-4" style={{ scrollbarWidth: 'none' }}>
        {CATEGORIES.map((cat) => (
          <motion.button
            key={cat.key}
            whileTap={{ scale: 0.92 }}
            onClick={() => setActiveCategory(cat.key)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all duration-200 ${
              activeCategory === cat.key
                ? 'gold-gradient text-black'
                : 'glass text-foreground'
            }`}
          >
            {cat.label}
          </motion.button>
        ))}
      </div>

      {/* Grid */}
      <div className="px-4">
        {error && <div className="mb-3 text-red-400 text-sm">{DATA_LOAD_ERROR_MESSAGE}</div>}
        {filtered.length === 0 && (
          <div className="glass rounded-2xl p-8 text-center text-muted-foreground text-sm">עדיין אין תמונות בגלריה</div>
        )}
        <motion.div layout className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <AnimatePresence>
            {filtered.map((photo, index) => (
              <motion.div
                key={photo.id || photo.url}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative aspect-square rounded-2xl overflow-hidden cursor-pointer group"
                onClick={() => setSelectedIndex(index)}
              >
                <img
                  src={photo.imageUrl || photo.url}
                  alt={photo.title || ''}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                {photo.is_featured && (
                  <div className="absolute top-2 right-2 gold-gradient text-black text-xs font-bold px-2 py-0.5 rounded-full">⭐</div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center">
                  <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {selectedIndex !== null && filtered[selectedIndex] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="keyboard-safe-overlay fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setSelectedIndex(null);
            }}
          >
            <div className="absolute top-4 right-4 flex gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); handleShare(); }}
                className="glass p-3 rounded-full"
              >
                <Share2 className="w-5 h-5 text-white" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setSelectedIndex(null); }}
                className="glass p-3 rounded-full"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handlePrev(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 glass p-3 rounded-full"
            >
              <ChevronRight className="w-6 h-6 text-white" />
            </button>
            <motion.img
              key={selectedIndex}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              src={filtered[selectedIndex].imageUrl || filtered[selectedIndex].url}
              alt={filtered[selectedIndex].title || ''}
              className="max-w-full max-h-full object-contain px-16"
              onPointerDown={(e) => e.stopPropagation()}
            />
            <button
              onClick={(e) => { e.stopPropagation(); handleNext(); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 glass p-3 rounded-full"
            >
              <ChevronLeft className="w-6 h-6 text-white" />
            </button>
            <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-1.5">
              {filtered.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${i === selectedIndex ? 'bg-primary w-4' : 'bg-white/40'}`}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
