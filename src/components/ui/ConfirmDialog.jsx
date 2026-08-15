import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { ModalActions, ModalBody, ModalHeader, ModalShell } from '@/components/ui/ModalShell';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'אישור',
  cancelLabel = 'חזרה',
  onConfirm,
  onClose,
  busy = false,
  destructive = true,
}) {
  const cancelRef = React.useRef(null);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      label={title}
      description={description}
      closeOnBackdrop={false}
      closeOnEscape={false}
      busy={busy}
      initialFocusRef={cancelRef}
      level="confirmation"
      className="dark-card max-w-sm rounded-3xl"
    >
      <ModalHeader title={title} onClose={onClose} busy={busy} />
      <ModalBody className="pb-2">
        <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <AlertTriangle
            className={destructive ? 'mt-0.5 h-5 w-5 flex-shrink-0 text-red-400' : 'mt-0.5 h-5 w-5 flex-shrink-0 text-primary'}
            aria-hidden="true"
          />
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </ModalBody>
      <ModalActions className="flex gap-3">
        <button
          ref={cancelRef}
          type="button"
          onClick={onClose}
          disabled={busy}
          className="glass min-h-11 flex-1 rounded-xl px-4 font-bold disabled:cursor-wait disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={destructive
            ? 'min-h-11 flex-1 rounded-xl bg-red-500 px-4 font-bold text-white disabled:cursor-wait disabled:opacity-50'
            : 'gold-gradient min-h-11 flex-1 rounded-xl px-4 font-black text-black disabled:cursor-wait disabled:opacity-50'}
        >
          <span className="inline-flex items-center justify-center gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {busy ? 'מעבד...' : confirmLabel}
          </span>
        </button>
      </ModalActions>
    </ModalShell>
  );
}

