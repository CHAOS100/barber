import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { doc, getDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase';
import GalTechBadge from './branding/GalTechBadge';

const toVersionMs = (timestamp) => (
  timestamp?.toMillis?.()
  || (timestamp?.seconds ? timestamp.seconds * 1000 : '')
  || ''
);

const withImageVersion = (url, timestamp) => {
  const cleanUrl = String(url || '').trim();
  const version = toVersionMs(timestamp);
  if (!cleanUrl || !version) return cleanUrl;
  return `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}v=${version}`;
};

export default function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState('show'); // show | fadeout
  // null = still loading, '' = loaded but no image, '<url>' = image ready
  const [splashImageUrl, setSplashImageUrl] = useState(null);

  useEffect(() => {
    // Fetch business settings to get profile / hero image.
    // Runs outside QueryClientProvider, so we call Firestore directly.
    getDoc(doc(getFirestoreDb(), 'settings', 'business'))
      .then((snapshot) => {
        if (!snapshot.exists()) { setSplashImageUrl(''); return; }
        const data = snapshot.data();
        const profileUrl = withImageVersion(data.profileImageUrl, data.profileImageUpdatedAt);
        const heroUrl = withImageVersion(data.homeHeroImageUrl, data.homeHeroImageUpdatedAt);
        setSplashImageUrl(profileUrl || heroUrl || '');
      })
      .catch(() => setSplashImageUrl(''));

    const t1 = setTimeout(() => setPhase('fadeout'), 2200);
    const t2 = setTimeout(() => onDone(), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  const imageLoaded = splashImageUrl !== null; // false while Firestore fetch is in-flight
  const hasImage = Boolean(splashImageUrl); // truthy URL string

  return (
    <AnimatePresence>
      {phase !== 'done' && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          animate={{ opacity: phase === 'fadeout' ? 0 : 1 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center"
        >
          {/* Logo / image area */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
            className="relative mb-8"
          >
            {/* Outer glow */}
            <div className="absolute inset-0 rounded-3xl gold-gradient opacity-20 blur-2xl scale-125" />
            {/* Border ring */}
            <div className="absolute -inset-1 rounded-3xl gold-gradient opacity-60" />

            {/* While Firestore is loading → dark skeleton (no flicker) */}
            {!imageLoaded && (
              <div className="relative w-28 h-28 rounded-3xl bg-secondary animate-pulse" />
            )}

            {/* Business image */}
            {imageLoaded && hasImage && (
              <img
                src={splashImageUrl}
                alt="OST BARBER"
                className="relative w-28 h-28 rounded-3xl object-cover"
              />
            )}

            {/* Fallback OST logo — only when loaded and no image configured */}
            {imageLoaded && !hasImage && (
              <div className="relative w-28 h-28 rounded-3xl gold-gradient text-black font-black text-3xl flex items-center justify-center">
                OST
              </div>
            )}
          </motion.div>

          {/* Text lockup */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5 }}
            className="text-center"
          >
            <h1 className="text-4xl font-black tracking-widest gold-text mb-1">OST</h1>
            <p className="text-xl font-light tracking-[0.4em] text-foreground/80 uppercase">Barber</p>
          </motion.div>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.5 }}
            className="text-muted-foreground text-sm mt-4 tracking-wide"
          >
            ספר פרימיום · ראשון לציון
          </motion.p>

          {/* Loading dots */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.4 }}
            className="flex gap-1.5 mt-12"
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                className="w-1.5 h-1.5 rounded-full gold-gradient"
              />
            ))}
          </motion.div>

          {/* GalTech branding at bottom */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.5 }}
            className="absolute bottom-0 left-0 right-0 flex justify-center"
            style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))' }}
          >
            <GalTechBadge variant="auth" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
