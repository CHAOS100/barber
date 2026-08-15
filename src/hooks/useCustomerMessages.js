import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { formatILS } from '@/lib/formatters';
import {
  clearCompletedAppointmentNotifications,
  clearReadCustomerNotifications,
  hideCustomerNotification,
  markCustomerNotificationRead,
  markCustomerNotificationsRead,
  subscribeToCurrentCustomerNotifications,
} from '@/lib/customerNotificationsFirestore';

const buildProfileNotices = (user) => {
  if (!user || user.isAdmin === true) return [];
  const notices = [];

  if (user.blocked === true || user.is_blocked === true) {
    const reason = user.blockedReason || user.blocked_reason;
    notices.push({
      id: 'profile_blocked',
      type: 'block',
      title: 'החשבון חסום להזמנות',
      message: reason
        ? `סיבה: ${reason}`
        : 'חשבונך חסום מקביעת תורים. לפרטים, פנה לעסק.',
      severity: 'danger',
      source: 'profile',
      createdAt: null,
      isRead: false,
      canDismiss: false,
      isCritical: true,
    });
  }

  if (user.requiresNoShowPayment === true) {
    const amount = Number(user.noShowPaymentAmount || 0);
    notices.push({
      id: 'profile_payment',
      type: 'payment_request',
      title: 'נדרש טיפול לפני הזמנה חדשה',
      message: amount > 0
        ? `נדרש תשלום של ${formatILS(amount)} עבור אי-הגעה קודמת לפני קביעת תור חדש.`
        : 'נדרש תשלום עבור אי-הגעה קודמת לפני קביעת תור חדש.',
      severity: 'warning',
      source: 'profile',
      createdAt: null,
      isRead: false,
      canDismiss: false,
      isCritical: true,
    });
  }

  const warnings = Number(user.warningCount || user.warning_count || 0);
  if (warnings > 0 && !user.blocked && !user.is_blocked) {
    notices.push({
      id: 'profile_warning',
      type: 'warning',
      title: 'אזהרה בחשבון',
      message: `צברת ${warnings} ${warnings === 1 ? 'אזהרה' : 'אזהרות'}. ביטול ללא הודעה מראש עלול לגרור תשלום בתורים הבאים.`,
      severity: 'warning',
      source: 'profile',
      createdAt: null,
      isRead: false,
      canDismiss: false,
      isCritical: true,
    });
  }

  return notices;
};

const newestFirst = (left, right) => {
  if (left.source === 'profile' && right.source !== 'profile') return -1;
  if (right.source === 'profile' && left.source !== 'profile') return 1;
  if (left.isRead !== right.isRead) return left.isRead ? 1 : -1;
  const leftTime = left.createdAt?.toMillis?.() || 0;
  const rightTime = right.createdAt?.toMillis?.() || 0;
  return rightTime - leftTime;
};

export function useCustomerMessages() {
  const { currentUser } = useCurrentUser();
  const uid = currentUser?.uid || null;
  const isAdmin = currentUser?.isAdmin === true;
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!uid || isAdmin) {
      setNotifications([]);
      setError('');
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError('');
    return subscribeToCurrentCustomerNotifications(
      (nextNotifications) => {
        setNotifications(nextNotifications);
        setLoading(false);
      },
      (error) => {
        console.warn('[useCustomerMessages] customer notifications listener failed', JSON.stringify({
          code: error?.code || 'unknown',
          message: error?.message || 'Unknown notification listener error',
        }));
        setError('לא הצלחנו לטעון את ההודעות. נסה לרענן.');
        setLoading(false);
        setNotifications([]);
      },
    );
  }, [isAdmin, uid]);

  const profileNotices = useMemo(() => buildProfileNotices(currentUser), [currentUser]);

  const messages = useMemo(() => (
    [...profileNotices, ...notifications].sort(newestFirst)
  ), [notifications, profileNotices]);

  const unreadCount = useMemo(
    () => messages.filter((message) => !message.isRead).length,
    [messages],
  );

  const markAsRead = useCallback(async (messageId) => {
    if (!uid || !messageId || String(messageId).startsWith('profile_')) return;
    try {
      await markCustomerNotificationRead(messageId);
    } catch (error) {
      console.warn('[useCustomerMessages] mark notification read failed', JSON.stringify({
        code: error?.code || 'unknown',
        message: error?.message || 'Unknown notification update error',
      }));
    }
  }, [uid]);

  const markAllAsRead = useCallback(async () => {
    if (!uid) return;
    const ids = messages
      .filter((message) => !message.isRead && !String(message.id).startsWith('profile_'))
      .map((message) => message.id);
    if (ids.length === 0) return;

    try {
      await markCustomerNotificationsRead(ids);
    } catch (error) {
      console.warn('[useCustomerMessages] mark all notifications read failed', JSON.stringify({
        code: error?.code || 'unknown',
        message: error?.message || 'Unknown notification update error',
      }));
    }
  }, [messages, uid]);

  const dismissMessage = useCallback(async (messageId) => {
    if (!uid || !messageId || String(messageId).startsWith('profile_')) return;
    try {
      await hideCustomerNotification(messageId);
    } catch (error) {
      console.warn('[useCustomerMessages] dismiss notification failed', JSON.stringify({
        code: error?.code || 'unknown',
        message: error?.message || 'Unknown notification dismiss error',
      }));
    }
  }, [uid]);

  const clearReadMessages = useCallback(async () => {
    if (!uid) return 0;
    try {
      return await clearReadCustomerNotifications();
    } catch (error) {
      console.warn('[useCustomerMessages] clear read notifications failed', JSON.stringify({
        code: error?.code || 'unknown',
        message: error?.message || 'Unknown notification cleanup error',
      }));
      return 0;
    }
  }, [uid]);

  const clearCompletedAppointmentMessages = useCallback(async () => {
    if (!uid) return 0;
    try {
      return await clearCompletedAppointmentNotifications();
    } catch (error) {
      console.warn('[useCustomerMessages] clear appointment notifications failed', JSON.stringify({
        code: error?.code || 'unknown',
        message: error?.message || 'Unknown appointment notification cleanup error',
      }));
      return 0;
    }
  }, [uid]);

  return {
    messages,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    clearReadMessages,
    clearCompletedAppointmentMessages,
    dismissMessage,
    isLoggedIn: Boolean(uid && !isAdmin),
  };
}
