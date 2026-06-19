import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Bell,
  BellOff,
  Calendar,
  CheckCheck,
  CheckCircle2,
  CreditCard,
  Info,
  MessageSquare,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useCustomerMessages } from '@/hooks/useCustomerMessages';

// ── Severity config ───────────────────────────────────────────────────────────

const SEVERITY = {
  info: {
    Icon: Info,
    iconClass: 'text-blue-400',
    bgClass: 'bg-blue-400/10',
    borderClass: 'border-blue-400/25',
    dotClass: 'bg-blue-400',
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatTime = (timestamp) => {
  if (!timestamp) return '';
  const ms = timestamp?.toMillis?.() || (timestamp instanceof Date ? timestamp.getTime() : 0);
  if (!ms) return '';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'כעת';
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שע׳`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'אתמול';
  if (days < 7) return `לפני ${days} ימים`;
  return new Date(ms).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
};

// ── Message card ──────────────────────────────────────────────────────────────

function MessageCard({ msg, onMarkRead }) {
  const sev = SEVERITY[msg.severity] || SEVERITY.info;
  const SevIcon = sev.Icon;
  const TypeIcon = TYPE_ICON[msg.type];
  const DisplayIcon = TypeIcon || SevIcon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`rounded-2xl border p-4 transition-colors duration-200 ${sev.bgClass} ${sev.borderClass} ${msg.isRead ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start gap-3">
        {/* Severity icon */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${sev.bgClass} ${sev.borderClass}`}>
          <DisplayIcon className={`w-5 h-5 ${sev.iconClass}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className={`font-black text-sm leading-snug ${msg.isRead ? 'text-muted-foreground' : 'text-foreground'}`}>
              {msg.title}
            </h3>
            <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
              {!msg.isRead && (
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sev.dotClass}`} />
              )}
              {msg.createdAt && (
                <span className="text-[10px] text-muted-foreground whitespace-nowrap" dir="rtl">
                  {formatTime(msg.createdAt)}
                </span>
              )}
            </div>
          </div>

          <p className={`text-xs leading-relaxed ${msg.isRead ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>
            {msg.message}
          </p>

          {!msg.isRead && msg.canDismiss && (
            <button
              onClick={() => onMarkRead(msg.id)}
              className={`mt-2 text-[11px] font-bold flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity ${sev.iconClass}`}
            >
              <CheckCheck className="w-3 h-3" />
              סמן כנקרא
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Notifications() {
  const navigate = useNavigate();
  const { messages, unreadCount, markAsRead, markAllAsRead } = useCustomerMessages();

  const hasNonProfileUnread = messages.some(
    (m) => !m.isRead && !m.id.startsWith('profile_'),
  );

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-30 glass border-b border-white/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="press-scale">
            <ArrowRight className="w-6 h-6" />
          </button>
          <h1 className="font-black text-lg flex-1">התראות</h1>
          {unreadCount > 0 && (
            <span className="glass-gold text-primary text-xs font-bold px-2.5 py-1 rounded-full">
              {unreadCount} חדשות
            </span>
          )}
          {hasNonProfileUnread && (
            <button
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
              <p className="text-muted-foreground text-sm">הודעות חשובות מהמספרה יופיעו כאן</p>
            </motion.div>
          ) : (
            messages.map((msg) => (
              <MessageCard key={msg.id} msg={msg} onMarkRead={markAsRead} />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
