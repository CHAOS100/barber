import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BARBER_PHOTO } from '../lib/mockData';

export default function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState('show'); // show | fadeout

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('fadeout'), 2200);
    const t2 = setTimeout(() => onDone(), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

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
          {/* Glow ring */}
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
            <img
              src={BARBER_PHOTO}
              alt="OST Barber"
              className="relative w-28 h-28 rounded-3xl object-cover"
            />
          </motion.div>

          {/* Logo text */}
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
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                className="w-1.5 h-1.5 rounded-full gold-gradient"
              />
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}