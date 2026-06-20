import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Ban,
  Bell,
  Calendar,
  CheckCircle2,
  CreditCard,
  Info,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { useCustomerMessages } from '@/hooks/useCustomerMessages';

const IMPORTANT_TYPES = new Set([
  'free_slot',
  'warning',
  'block',
  'payment_request',
  'no_show_payment_required',
  'admin_custom',
  'broadcast',
]);

const SEVERITY_PRIORITY = {
  danger: 4,
  warning: 3,
  success: 2,
  info: 1,
};

const SEVERITY_STYLE = {
  info: {
    Icon: Info,
    iconClass: 'text-[#93E3BD]',
    bgClass: 'bg-[#93E3BD]/10',
    borderClass: 'border-[#93E3BD]/25',
  },
  success: {
    Icon: Sparkles,
    iconClass: 'text-[#93E3BD]',
    bgClass: 'bg-[#93E3BD]/10',
    borderClass: 'border-[#93E3BD]/25',
  },
  warning: {
    Icon: AlertTriangle,
    iconClass: 'text-yellow-400',
    bgClass: 'bg-yellow-400/10',
    borderClass: 'border-yellow-400/25',
  },
  danger: {
    Icon: ShieldAlert,
    iconClass: 'text-red-400',
    bgClass: 'bg-red-400/10',
    borderClass: 'border-red-400/25',
  },
};

const TYPE_ICON = {
  free_slot: Calendar,
  appointment: Calendar,
  payment_request: CreditCard,
  no_show_payment_required: CreditCard,
  block: Ban,
  warning: AlertTriangle,
  broadcast: Bell,
  admin_custom: MessageSquare,
  system: Info,
};

const formatTimestamp = (timestamp) => {
  const date = timestamp?.toDate?.();
  if (!date) return '';
  return date.toLocaleString('he-IL', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
};

const chooseImportantNotification = (messages) => (
  messages
    .filter((message) => (
      !message.isRead
      && message.source !== 'profile'
      && IMPORTANT_TYPES.has(message.type)
    ))
    .sort((left, right) => {
      const priorityDiff = (SEVERITY_PRIORITY[right.severity] || 0)
        - (SEVERITY_PRIORITY[left.severity] || 0);
      if (priorityDiff !== 0) return priorityDiff;
      const leftTime = left.createdAt?.toMillis?.() || 0;
      const rightTime = right.createdAt?.toMillis?.() || 0;
      return rightTime - leftTime;
    })
);

export default function CustomerNotificationPopup() {
  const navigate = useNavigate();
  const { messages, markAsRead, isLoggedIn } = useCustomerMessages();
  const importantMessages = React.useMemo(
    () => chooseImportantNotification(messages),
    [messages],
  );
  const activeMessage = importantMessages[0] || null;
  const otherUnreadCount = Math.max(0, importantMessages.length - 1);

  if (!isLoggedIn) return null;

  const close = async () => {
    if (activeMessage) await markAsRead(activeMessage.id);
  };

  const openInbox = async () => {
    if (activeMessage) await markAsRead(activeMessage.id);
    navigate('/notifications');
  };

  const severity = SEVERITY_STYLE[activeMessage?.severity] || SEVERITY_STYLE.info;
  const DisplayIcon = TYPE_ICON[activeMessage?.type] || severity.Icon;

  return (
    <AnimatePresence>
      {activeMessage && (
        <motion.div
          key={activeMessage.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md"
          style={{ paddingTop: 'var(--safe-area-top)', paddingBottom: 'var(--safe-area-bottom)' }}
          dir="rtl"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 14 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className={`w-full max-w-sm rounded-3xl border p-5 shadow-2xl ${severity.bgClass} ${severity.borderClass}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${severity.bgClass} ${severity.borderClass}`}>
                <DisplayIcon className={`w-6 h-6 ${severity.iconClass}`} />
              </div>
              <button
                type="button"
                onClick={close}
                className="glass rounded-xl p-2 text-muted-foreground press-scale"
                aria-label="סגור הודעה"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4">
              <h2 className="text-xl font-black text-foreground leading-tight">
                {activeMessage.title}
              </h2>
              {activeMessage.createdAt && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatTimestamp(activeMessage.createdAt)}
                </p>
              )}
              <p className="mt-3 text-sm leading-7 text-muted-foreground whitespace-pre-line">
                {activeMessage.message}
              </p>
              {otherUnreadCount > 0 && (
                <p className="mt-3 rounded-2xl bg-black/20 px-3 py-2 text-xs text-primary">
                  יש לך עוד {otherUnreadCount} הודעות חדשות
                </p>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={close}
                className="rounded-2xl bg-primary py-3 text-sm font-black text-black press-scale flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                קראתי
              </button>
              <button
                type="button"
                onClick={openInbox}
                className="rounded-2xl border border-primary/30 bg-primary/10 py-3 text-sm font-black text-primary press-scale"
              >
                פתח הודעות
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
