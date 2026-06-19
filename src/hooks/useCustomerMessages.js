import { useMemo, useState, useEffect } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  subscribeToCustomerAdminMessages,
  subscribeToCustomerWaitingListAlerts,
} from '@/lib/customerMessagesFirestore';

// ─── Read tracking via localStorage ─────────────────────────────────────────

const lsKey = (uid) => `ost_read_msgs_${uid}`;

const loadReadSet = (uid) => {
  if (!uid) return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(lsKey(uid))) || []); }
  catch { return new Set(); }
};

const persistReadSet = (uid, set) => {
  if (!uid) return;
  try {
    localStorage.setItem(lsKey(uid), JSON.stringify([...set].slice(-300)));
  } catch {}
};

// ─── Profile-derived notices (no Firestore read needed) ─────────────────────

const buildProfileNotices = (user) => {
  if (!user) return [];
  const notices = [];

  if (user.blocked === true || user.is_blocked === true) {
    const reason = user.blockedReason || user.blocked_reason;
    notices.push({
      id: 'profile_blocked',
      type: 'block',
      title: 'החשבון חסום להזמנות',
      message: reason
        ? `סיבה: ${reason}`
        : 'חשבונך חסום מלקבוע תורים. לפרטים, פנה אלינו ישירות.',
      severity: 'danger',
      source: 'profile',
      createdAt: null,
    });
  }

  if (user.requiresNoShowPayment === true) {
    const amount = Number(user.noShowPaymentAmount || 0);
    notices.push({
      id: 'profile_payment',
      type: 'payment_request',
      title: 'נדרש טיפול לפני הזמנה חדשה',
      message: amount > 0
        ? `נדרש תשלום של ₪${amount} עבור אי-הגעה קודמת לפני שניתן לקבוע תור חדש.`
        : 'נדרש תשלום עבור אי-הגעה קודמת לפני קביעת תור חדש.',
      severity: 'warning',
      source: 'profile',
      createdAt: null,
    });
  }

  const warnings = Number(user.warningCount || user.warning_count || 0);
  if (warnings > 0 && !user.blocked && !user.is_blocked) {
    notices.push({
      id: 'profile_warning',
      type: 'warning',
      title: 'אזהרה בחשבון',
      message: `צברת ${warnings} ${warnings === 1 ? 'אזהרה' : 'אזהרות'}. ביטול ללא הודעה מראש עלול לגרור תשלום מראש בתורים הבאים.`,
      severity: 'warning',
      source: 'profile',
      createdAt: null,
    });
  }

  return notices;
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCustomerMessages() {
  const { currentUser } = useCurrentUser();
  const uid = currentUser?.uid || null;

  const [readSet, setReadSet] = useState(() => loadReadSet(uid));
  const [adminMsgs, setAdminMsgs] = useState([]);
  const [waitingAlerts, setWaitingAlerts] = useState([]);

  // Reload readSet when uid changes (login/logout)
  useEffect(() => { setReadSet(loadReadSet(uid)); }, [uid]);

  // Admin messages subscription (graceful permission-denied)
  useEffect(() => {
    if (!uid) { setAdminMsgs([]); return; }
    return subscribeToCustomerAdminMessages(uid, setAdminMsgs, (err) => {
      console.warn('[useCustomerMessages] admin messages error:', String(err?.code || err?.message || 'unknown'));
    });
  }, [uid]);

  // Waiting list alerts subscription
  useEffect(() => {
    if (!uid) { setWaitingAlerts([]); return; }
    return subscribeToCustomerWaitingListAlerts(setWaitingAlerts, (err) => {
      console.warn('[useCustomerMessages] waiting list alerts error:', String(err?.code || err?.message || 'unknown'));
    });
  }, [uid]);

  // Profile notices derived from session — always fresh
  const profileNotices = useMemo(() => buildProfileNotices(currentUser), [currentUser]);

  // Merge all sources and annotate with read status
  const messages = useMemo(() => {
    const all = [
      // Profile notices: always unread, non-dismissible (cleared when profile changes)
      ...profileNotices.map((n) => ({ ...n, isRead: false, canDismiss: false })),
      // Waiting list alerts: dismissible via localStorage read tracking
      ...waitingAlerts.map((a) => ({ ...a, isRead: readSet.has(a.id), canDismiss: true })),
      // Admin messages: non-dismissible (admin controls lifecycle)
      ...adminMsgs.map((m) => ({ ...m, isRead: readSet.has(m.id), canDismiss: false })),
    ];

    return all.sort((a, b) => {
      // Profile notices always first
      if (a.source === 'profile' && b.source !== 'profile') return -1;
      if (b.source === 'profile' && a.source !== 'profile') return 1;
      // Unread before read
      if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
      // Newest first
      const at = a.createdAt?.toMillis?.() || 0;
      const bt = b.createdAt?.toMillis?.() || 0;
      return bt - at;
    });
  }, [profileNotices, waitingAlerts, adminMsgs, readSet]);

  const unreadCount = useMemo(
    () => messages.filter((m) => !m.isRead).length,
    [messages],
  );

  // Mark a single message as read (profile notices are excluded)
  const markAsRead = (msgId) => {
    if (!uid || !msgId || msgId.startsWith('profile_')) return;
    setReadSet((prev) => {
      const next = new Set(prev);
      next.add(msgId);
      persistReadSet(uid, next);
      return next;
    });
  };

  // Mark all non-profile messages as read
  const markAllAsRead = () => {
    if (!uid) return;
    setReadSet((prev) => {
      const next = new Set(prev);
      messages.forEach((m) => { if (!m.id.startsWith('profile_')) next.add(m.id); });
      persistReadSet(uid, next);
      return next;
    });
  };

  return { messages, unreadCount, markAsRead, markAllAsRead, isLoggedIn: Boolean(uid) };
}
