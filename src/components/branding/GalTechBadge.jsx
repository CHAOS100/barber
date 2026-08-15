import React from 'react';
import { Info } from 'lucide-react';
import { ModalActions, ModalBody, ModalHeader, ModalShell } from '@/components/ui/ModalShell';

export default function GalTechBadge({ variant = 'app' }) {
  const [open, setOpen] = React.useState(false);

  const modal = (
    <ModalShell
      open={open}
      onClose={() => setOpen(false)}
      label="על GalTech"
      closeOnBackdrop
      className="dark-card max-w-sm rounded-3xl"
    >
      <ModalHeader title="על GalTech" onClose={() => setOpen(false)}>
        <p className="text-xs text-muted-foreground">פיתוח דיגיטלי לעסקים</p>
      </ModalHeader>
      <ModalBody>
            <div className="mb-4 flex items-start gap-3">
              <div className="flex items-center gap-2">
                <div className="glass-gold flex h-10 w-10 items-center justify-center rounded-2xl">
                  <Info className="h-5 w-5 text-primary" />
                </div>
              </div>
            </div>
            <p className="text-sm leading-7 text-muted-foreground">
              GalTech היא חברת פיתוח דיגיטלית שמפתחת אתרים, אפליקציות ומערכות ניהול לעסקים.
              המטרה שלנו היא להפוך תהליכים מסובכים לפשוטים, יפים ונוחים לשימוש.
            </p>
      </ModalBody>
      <ModalActions>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="w-full min-h-11 rounded-2xl bg-primary py-3 text-sm font-black text-black press-scale"
        >
          הבנתי
        </button>
      </ModalActions>
    </ModalShell>
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

      {modal}
    </>
  );
}
