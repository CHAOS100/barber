import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, X } from 'lucide-react';

export default function GalTechBadge({ variant = 'app' }) {
  const [open, setOpen] = React.useState(false);

  // Lock body scroll while modal is open so the overlay stays viewport-fixed on iOS
  React.useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const modal = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm"
          style={{
            paddingTop: 'max(20px, env(safe-area-inset-top, 20px))',
            paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
          }}
          onClick={() => setOpen(false)}
          dir="rtl"
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.96 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="dark-card w-full max-w-sm rounded-3xl p-5 overflow-y-auto"
            style={{ maxHeight: 'min(480px, 80dvh)' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="glass-gold flex h-10 w-10 items-center justify-center rounded-2xl">
                  <Info className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-black">על GalTech</h2>
                  <p className="text-xs text-muted-foreground">פיתוח דיגיטלי לעסקים</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="glass rounded-xl p-2 text-muted-foreground press-scale"
                aria-label="סגור"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm leading-7 text-muted-foreground">
              GalTech היא חברת פיתוח דיגיטלית שמפתחת אתרים, אפליקציות ומערכות ניהול לעסקים.
              המטרה שלנו היא להפוך תהליכים מסובכים לפשוטים, יפים ונוחים לשימוש.
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-5 w-full rounded-2xl bg-primary py-3 text-sm font-black text-black press-scale"
            >
              הבנתי
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`galtech-badge galtech-badge--${variant} press-scale`}
        aria-label="על GalTech"
      >
        by GalTech
      </button>

      {createPortal(modal, document.body)}
    </>
  );
}
