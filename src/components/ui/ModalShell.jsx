import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const activeModalIds = [];

function registerModal(id) {
  if (!activeModalIds.includes(id)) activeModalIds.push(id);
  document.documentElement.classList.add('modal-open');
  document.body.classList.add('modal-open');
}

function unregisterModal(id) {
  const index = activeModalIds.lastIndexOf(id);
  if (index !== -1) activeModalIds.splice(index, 1);

  if (activeModalIds.length === 0) {
    document.documentElement.classList.remove('modal-open');
    document.body.classList.remove('modal-open');
  }
}

function isTopModal(id) {
  return activeModalIds.at(-1) === id;
}

function getFocusableElements(container) {
  if (!container) return [];

  return Array.from(container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => (
    element instanceof HTMLElement
    && !element.hasAttribute('hidden')
    && element.getAttribute('aria-hidden') !== 'true'
    && element.getClientRects().length > 0
  ));
}

/**
 * Shared application modal primitive.
 *
 * It deliberately owns only interaction infrastructure. Callers retain their
 * existing card markup and styling so customer and admin screens keep the OST
 * visual language while sharing one reliable portal, focus and scroll model.
 */
export function ModalShell({
  open,
  onClose,
  label,
  description,
  children,
  className,
  overlayClassName,
  closeOnBackdrop = false,
  closeOnEscape = true,
  busy = false,
  initialFocusRef,
  level = 'modal',
}) {
  const reactId = React.useId();
  const modalId = React.useMemo(() => `ost-modal-${reactId.replaceAll(':', '')}`, [reactId]);
  const dialogRef = React.useRef(null);
  const openerRef = React.useRef(null);
  const backdropPointerStartedRef = React.useRef(false);
  const onCloseRef = React.useRef(onClose);
  const busyRef = React.useRef(busy);
  const escapeRef = React.useRef(closeOnEscape);

  React.useEffect(() => {
    onCloseRef.current = onClose;
    busyRef.current = busy;
    escapeRef.current = closeOnEscape;
  }, [busy, closeOnEscape, onClose]);

  React.useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;

    openerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    registerModal(modalId);

    const focusFrame = window.requestAnimationFrame(() => {
      const requestedTarget = initialFocusRef?.current;
      const target = requestedTarget instanceof HTMLElement
        ? requestedTarget
        : dialogRef.current;
      target?.focus({ preventScroll: true });
    });

    const handleKeyDown = (event) => {
      if (!isTopModal(modalId)) return;

      if (event.key === 'Escape') {
        if (!escapeRef.current || busyRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = getFocusableElements(dialogRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1);
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown, true);
      unregisterModal(modalId);

      const opener = openerRef.current;
      if (opener?.isConnected) {
        window.requestAnimationFrame(() => opener.focus({ preventScroll: true }));
      }
    };
  }, [initialFocusRef, modalId, open]);

  if (typeof document === 'undefined') return null;

  const requestBackdropClose = (event) => {
    const endedOnBackdrop = event.target === event.currentTarget;
    if (
      backdropPointerStartedRef.current
      && endedOnBackdrop
      && closeOnBackdrop
      && !busy
      && isTopModal(modalId)
    ) {
      onClose?.();
    }
    backdropPointerStartedRef.current = false;
  };

  const zIndex = level === 'system'
    ? 'var(--z-system-dialog)'
    : level === 'confirmation'
      ? 'var(--z-confirmation)'
      : 'var(--z-overlay)';

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key={modalId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className={cn(
            'keyboard-safe-overlay fixed inset-x-0 flex items-center justify-center bg-black/80 backdrop-blur-sm',
            overlayClassName,
          )}
          style={{ zIndex }}
          onPointerDown={(event) => {
            backdropPointerStartedRef.current = event.target === event.currentTarget;
          }}
          onPointerUp={requestBackdropClose}
          onPointerCancel={() => {
            backdropPointerStartedRef.current = false;
          }}
          dir="rtl"
          data-modal-overlay="true"
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={label || 'חלון'}
            aria-describedby={description ? `${modalId}-description` : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className={cn('keyboard-safe-modal relative w-full outline-none', className)}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            data-modal-content="true"
          >
            {description && (
              <span id={`${modalId}-description`} className="sr-only">{description}</span>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function ModalHeader({ title, onClose, busy = false, className, children }) {
  return (
    <div className={cn('flex flex-shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-5', className)}>
      <div className="min-w-0">
        {title && <h2 className="text-lg font-black leading-tight">{title}</h2>}
        {children}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="press-scale glass flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-xl disabled:cursor-wait disabled:opacity-50"
          aria-label="סגירת החלון"
          data-modal-close="true"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function ModalBody({ className, ...props }) {
  return <div className={cn('modal-scroll-body px-5', className)} {...props} />;
}

export function ModalActions({ className, ...props }) {
  return <div className={cn('modal-actions px-5', className)} {...props} />;
}
