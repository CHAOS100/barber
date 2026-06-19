import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  BellOff,
  Calendar,
  CheckCheck,
  CreditCard,
  Info,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { useCustomerMessages } from '@/hooks/useCustomerMessages';

const SEVERITY = {
  info: {
    Icon: Info,
    iconClass: 'text-[#93E3BD]',
    bgClass: 'bg-[#93E3BD]/10',
    borderClass: 'border-[#93E3BD]/25',
    dotClass: 'bg-[#93E3BD]',
  },
  success: {
    Icon: Sparkles,
    iconClass: 'text-[#93E3BD]',
    bgClass: 'bg-[#93E3BD]/10',
    borderClass: 'border-[#93E3BD]/25',
    dotClass: 'bg-[#93E3BD]',
  },
  warning: {
    Icon: AlertTriangle,
    iconClass: 'text-yellow-400',
    bgClass: 'bg-yellow-400/10',
    borderClass: 'border-yellow-400/25',
    dotClass: 'bg-yellow-400',
  },
  danger: {
    Icon: ShieldAlert,
    iconClass: 'text-red-400',
    bgClass: 'bg-red-400/10',
    borderClass: 'border-red-400/25',
    dotClass: 'bg-red-400',
  },
};

const TYPE_ICON = {
  free_slot: Calendar,
  appointment: Calendar,
  payment_request: CreditCard,
  block: Ban,
  warning: AlertTriangle,
  broadcast: MessageSquare,
  admin_custom: MessageSquare,
  system: Info,
};

const formatTime = (timestamp) => {
  const date = timestamp?.toDate?.();
  if (!date) return '';
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'כעת';
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שע׳`;
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
};

function MessageIcon({ message }) {
  const severity = SEVERITY[message.severity] || SEVERITY.info;
  const DisplayIcon = TYPE_ICON[message.type] || severity.Icon;
  return (
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${severity.bgClass} ${severity.borderClass}`}>
      <DisplayIcon className={`w-5 h-5 ${severity.iconClass}`} />
    </div>
  );
}

function MessageCard({ message, onOpen, onMarkRead }) {
  const severity = SEVERITY[message.severity] || SEVERITY.info;

  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      onClick={() => onOpen(message)}
      className={`w-full rounded-2xl border p-4 text-right transition-colors duration-200 ${severity.bgClass} ${severity.borderClass} ${message.isRead ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start gap-3">
        <MessageIcon message={message} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className={`font-black text-sm leading-snug ${message.isRead ? 'text-muted-foreground' : 'text-foreground'}`}>
              {message.title}
            </h3>
            <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
              {!message.isRead && (
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${severity.dotClass}`} />
              )}
              {message.createdAt && (
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {formatTime(message.createdAt)}
                </span>
              )}
            </div>
          </div>

          <p className={`text-xs leading-relaxed line-clamp-2 ${message.isRead ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>
            {message.message}
          </p>

          {!message.isRead && message.canDismiss && (
            <span
              onClick={(event) => {
                event.stopPropagation();
                onMarkRead(message.id);
              }}
              className={`mt-2 inline-flex items-center gap-1 text-[11px] font-bold opacity-80 hover:opacity-100 transition-opacity ${severity.iconClass}`}
            >
              <CheckCheck className="w-3 h-3" />
              סמן כנקרא
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

export default function Notifications() {
  const navigate = useNavigate();
  const { messages, unreadCount, markAsRead, markAllAsRead } = useCustomerMessages();
  const [selectedMessage, setSelectedMessage] = React.useState(null);
  const hasDismissibleUnread = messages.some(
    (message) => !message.isRead && message.canDismiss,
  );

  const openMessage = async (message) => {
    setSelectedMessage(message);
    if (!message.isRead && message.canDismiss) {
      await markAsRead(message.id);
    }
  };

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky top-0 z-30 glass border-b border-white/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="press-scale">
            <ArrowRight className="w-6 h-6" />
          </button>
          <h1 className="font-black text-lg flex-1">הודעות ועדכונים</h1>
          {unreadCount > 0 && (
            <span className="glass-gold text-primary text-xs font-bold px-2.5 py-1 rounded-full">
              {unreadCount} חדשות
            </span>
          )}
          {hasDismissibleUnread && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="flex items-center gap-1 text-primary text-xs font-bold press-scale"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              נקרא הכל
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-4 space-y-2.5">
        <AnimatePresence mode="popLayout">
          {messages.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass rounded-3xl p-10 text-center mt-6"
            >
              <BellOff className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h2 className="font-black text-lg mb-1">אין הודעות חדשות כרגע</h2>
              <p className="text-muted-foreground text-sm">הודעות חשובות מהעסק יופיעו כאן</p>
            </motion.div>
          ) : (
            messages.map((message) => (
              <MessageCard
                key={message.id}
                message={message}
                onOpen={openMessage}
                onMarkRead={markAsRead}
              />
            ))
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {selectedMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="keyboard-safe-overlay fixed inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-md"
            onClick={() => setSelectedMessage(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.96 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="keyboard-safe-modal dark-card rounded-3xl p-5 w-full max-w-sm overflow-y-auto"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <MessageIcon message={selectedMessage} />
                <button
                  type="button"
                  onClick={() => setSelectedMessage(null)}
                  className="glass p-2 rounded-xl text-muted-foreground press-scale"
                  aria-label="סגור"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <h2 className="text-xl font-black leading-tight">{selectedMessage.title}</h2>
              {selectedMessage.createdAt && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedMessage.createdAt.toDate().toLocaleString('he-IL', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </p>
              )}
              <p className="mt-4 text-sm text-muted-foreground leading-7 whitespace-pre-line">
                {selectedMessage.message}
              </p>
              <button
                type="button"
                onClick={() => setSelectedMessage(null)}
                className="mt-5 w-full rounded-2xl bg-primary py-3 text-sm font-black text-black press-scale"
              >
                הבנתי
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
