import React from 'react';
import { motion } from 'framer-motion';
import { Award, Gift, Scissors, Star } from 'lucide-react';

const POINTS_FOR_FREE_HAIRCUT = 200;

export default function LoyaltyCard({ points = 0, visits = 0 }) {
  const progress = Math.min((points / POINTS_FOR_FREE_HAIRCUT) * 100, 100);
  const remaining = Math.max(POINTS_FOR_FREE_HAIRCUT - points, 0);
  const isReady = points >= POINTS_FOR_FREE_HAIRCUT;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-gold rounded-2xl p-5 mb-4"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-primary" />
          <span className="font-bold text-sm">תוכנית נאמנות</span>
        </div>
        {isReady ? (
          <span className="gold-gradient text-black text-xs font-black px-3 py-1 rounded-full animate-pulse">
            🎁 מגיע לך!
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">{remaining} נקודות לתספורת חינם</span>
        )}
      </div>

      {/* Points display */}
      <div className="flex items-end gap-2 mb-3">
        <span className="text-4xl font-black gold-text">{points}</span>
        <span className="text-muted-foreground text-sm mb-1">/ {POINTS_FOR_FREE_HAIRCUT} נקודות</span>
      </div>

      {/* Progress Bar */}
      <div className="h-3 bg-secondary rounded-full overflow-hidden mb-3">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
          className="h-full gold-gradient rounded-full relative"
        >
          <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
        </motion.div>
      </div>

      {/* Milestones */}
      <div className="flex justify-between text-xs text-muted-foreground mb-4">
        <span>0</span>
        <span>50</span>
        <span>100</span>
        <span>150</span>
        <span className="text-primary font-bold">200 🎁</span>
      </div>

      {/* How to earn */}
      <div className="border-t border-white/10 pt-3">
        <p className="text-xs text-muted-foreground font-bold mb-2">איך מרוויחים נקודות?</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Scissors, label: 'תספורת', pts: '+10' },
            { icon: Star, label: 'ביקורת', pts: '+5' },
            { icon: Gift, label: 'הפניה', pts: '+25' },
          ].map(({ icon: Icon, label, pts }) => (
            <div key={label} className="glass rounded-xl p-2 text-center">
              <Icon className="w-3 h-3 text-primary mx-auto mb-1" />
              <div className="text-xs text-foreground">{label}</div>
              <div className="text-primary font-black text-sm">{pts}</div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}