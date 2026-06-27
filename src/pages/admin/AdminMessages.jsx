import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowRight,
  Bell,
  Calendar,
  CheckCheck,
  MessageSquareText,
  Send,
  ShieldAlert,
  UserRound,
  Users,
} from 'lucide-react';
import { subscribeToAdminNotificationJobs } from '@/lib/notificationJobsFirestore';
import { subscribeToAllCustomerProfiles } from '@/lib/customerProfilesFirestore';
import { sendAdminCustomerMessage, subscribeToAdminCustomerNotifications } from '@/lib/customerNotificationsFirestore';
import { DATA_LOAD_ERROR_MESSAGE, getUserFacingErrorMessage } from '@/lib/userFacingErrors';

const STATUS_LABELS = {
  pending: 'ממתין לשליחה',
  sent: 'נשלח',
  failed: 'נכשל',
};

const JOB_TYPE_LABELS = {
  appointment_created_admin: 'תור חדש למנהל',
  appointment_approved: 'אישור תור ללקוח',
  appointment_reminder_24h: 'תזכורת 24 שעות',
  appointment_reminder_2h: 'תזכורת שעתיים',
  appointment_cancelled: 'ביטול תור',
  waiting_list_slot_available: 'תור התפנה לרשימת המתנה',
  waiting_list_manual_notify: 'הודעה ידנית לרשימת המתנה',
  waiting_list_manual_sms_notify: 'התראת רשימת המתנה ישנה',
};

const MESSAGE_TYPE_OPTIONS = [
  { value: 'admin_custom', label: 'הודעה אישית מהעסק' },
  { value: 'broadcast', label: 'עדכון כללי' },
  { value: 'free_slot', label: 'תור שהתפנה' },
  { value: 'warning', label: 'אזהרה' },
  { value: 'block', label: 'הודעת חסימה' },
  { value: 'payment_request', label: 'דרישת תשלום' },
  { value: 'no_show_payment_required', label: 'תשלום - אי הגעה' },
  { value: 'appointment', label: 'עדכון תור' },
  { value: 'system', label: 'עדכון מערכת' },
];

const MESSAGE_TYPE_LABELS = MESSAGE_TYPE_OPTIONS.reduce((acc, option) => ({
  ...acc,
  [option.value]: option.label,
}), {});

const AUDIENCE_OPTIONS = [
  { value: 'all_customers', label: 'כל הלקוחות', Icon: Users },
  { value: 'single_customer', label: 'לקוח ספציפי', Icon: UserRound },
  { value: 'future_appointments', label: 'לקוחות עם תור עתידי', Icon: Calendar },
  { value: 'waiting_list', label: 'רשימת המתנה', Icon: Bell },
];

const INITIAL_FORM = {
  targetType: 'all_customers',
  targetCustomerId: '',
  title: '',
  message: '',
};

const formatTimestamp = (timestamp) => {
  if (!timestamp?.toDate) return '-';
  return timestamp.toDate().toLocaleString('he-IL', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
};

const getCleanErrorMessage = (error) => {
  const message = String(error?.message || '').trim();
  if (message && !/Firebase|Firestore|SDK|permission-denied|document|collection/i.test(message)) {
    return message;
  }
  return getUserFacingErrorMessage(error);
};

export default function AdminMessages() {
  const navigate = useNavigate();
  const [jobs, setJobs] = React.useState([]);
  const [customers, setCustomers] = React.useState([]);
  const [customerNotifications, setCustomerNotifications] = React.useState([]);
  const [dataError, setDataError] = React.useState('');
  const [form, setForm] = React.useState(INITIAL_FORM);
  const [sendSuccess, setSendSuccess] = React.useState(false);
  const [sendError, setSendError] = React.useState('');

  React.useEffect(() => {
    console.log('[ADMIN_MESSAGES_DEBUG] page mounted');
  }, []);

  React.useEffect(() => subscribeToAdminNotificationJobs(
    setJobs,
    (listenerError) => {
      console.error('[Firestore] Admin notification jobs listener failed', JSON.stringify({
        code: listenerError?.code || 'unknown',
        message: listenerError?.message || 'Unknown error',
      }));
      setDataError(getUserFacingErrorMessage(listenerError, DATA_LOAD_ERROR_MESSAGE));
    },
  ), []);

  React.useEffect(() => subscribeToAllCustomerProfiles(
    setCustomers,
    (listenerError) => {
      console.warn('[Firestore] Customer list listener failed', JSON.stringify({
        code: listenerError?.code || 'unknown',
        message: listenerError?.message || 'Unknown error',
      }));
    },
  ), []);

  React.useEffect(() => subscribeToAdminCustomerNotifications(
    setCustomerNotifications,
    (listenerError) => {
      console.warn('[Firestore] Customer notifications listener failed', JSON.stringify({
        code: listenerError?.code || 'unknown',
        message: listenerError?.message || 'Unknown error',
      }));
    },
  ), []);

  const inAppMessageSummaries = React.useMemo(() => {
    const byBatch = new Map();

    customerNotifications.forEach((notification) => {
      const key = notification.messageBatchId || notification.id;
      const current = byBatch.get(key) || {
        id: key,
        title: notification.title || 'הודעה ללא כותרת',
        type: notification.type || 'system',
        severity: notification.severity || 'info',
        targetType: notification.targetType || 'single_customer',
        createdAt: notification.createdAt || null,
        receivedCount: 0,
        readCount: 0,
        latestReadAt: null,
        sampleCustomerName: '',
        sampleCustomerPhone: '',
      };

      current.receivedCount += 1;
      if (notification.isRead) current.readCount += 1;

      const readMs = notification.readAt?.toMillis?.() || 0;
      const currentLatestMs = current.latestReadAt?.toMillis?.() || 0;
      if (readMs > currentLatestMs) current.latestReadAt = notification.readAt;

      current.sampleCustomerName = current.sampleCustomerName || notification.readByName || '';
      current.sampleCustomerPhone = current.sampleCustomerPhone
        || notification.readByPhone
        || notification.targetPhone
        || '';

      byBatch.set(key, current);
    });

    return [...byBatch.values()].sort((left, right) => {
      const leftTime = left.createdAt?.toMillis?.() || 0;
      const rightTime = right.createdAt?.toMillis?.() || 0;
      return rightTime - leftTime;
    });
  }, [customerNotifications]);

  const createMessageMutation = useMutation({
    mutationFn: sendAdminCustomerMessage,
    onSuccess: (result) => {
      console.log('[ADMIN_MESSAGES_DEBUG] submit success');
      console.log('[ADMIN_MESSAGES_DEBUG] in-app created count', result?.createdCount);
      console.log('[ADMIN_MESSAGES_DEBUG] push jobs created count', result?.pushJobCount);
      console.log('[ADMIN_MESSAGES_DEBUG] push sent count', result?.sentCount);
      setSendSuccess(true);
      setSendError('');
      setForm(INITIAL_FORM);
    },
    onError: (mutationError) => {
      console.error('[ADMIN_MESSAGES_DEBUG] submit failed', JSON.stringify({
        code: mutationError?.code,
        message: mutationError?.message,
      }));
      setSendError(getCleanErrorMessage(mutationError) || 'אירעה שגיאה בשליחת ההודעה');
      setSendSuccess(false);
    },
  });

  const handleSend = () => {
    console.log('[ADMIN_MESSAGES_DEBUG] send clicked', JSON.stringify({
      targetType: form.targetType,
      hasTitle: Boolean(form.title.trim()),
      hasMessage: Boolean(form.message.trim()),
    }));

    if (!form.title.trim()) {
      setSendError('יש להזין כותרת להודעה.');
      return;
    }
    if (!form.message.trim()) {
      setSendError('יש להזין תוכן להודעה.');
      return;
    }
    if (form.targetType === 'single_customer' && !form.targetCustomerId) {
      setSendError('יש לבחור לקוח.');
      return;
    }

    setSendError('');
    setSendSuccess(false);

    const payload = {
      targetType: form.targetType,
      targetCustomerId: form.targetCustomerId || undefined,
      title: form.title.trim(),
      message: form.message.trim(),
    };

    console.log('[ADMIN_MESSAGES_DEBUG] submit started', JSON.stringify({
      targetType: payload.targetType,
      hasCustomer: Boolean(payload.targetCustomerId),
    }));

    createMessageMutation.mutate(payload);
  };

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      {/* Page header */}
      <div className="sticky-top-safe z-30 glass border-b border-white/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/admin')} className="press-scale">
            <ArrowRight className="w-6 h-6" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-black">הודעות</h1>
            <p className="text-muted-foreground text-xs">שליחת הודעות ומעקב Push</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* Data-load error */}
        {dataError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
            {dataError}
          </div>
        )}

        {/* ===== INLINE COMPOSER ===== */}
        <div className="dark-card rounded-3xl p-5 space-y-4">
          {/* Composer heading */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 glass-gold rounded-2xl flex items-center justify-center flex-shrink-0">
              <Send className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-black text-lg">שליחת הודעה</h2>
              <p className="text-xs text-muted-foreground">ההודעה תופיע בתוך האפליקציה ותישלח כהתראת Push</p>
            </div>
          </div>

          {/* Audience selector */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">למי לשלוח?</p>
            <div className="grid grid-cols-2 gap-2">
              {AUDIENCE_OPTIONS.map((option) => {
                const AudienceIcon = option.Icon;
                const active = form.targetType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      console.log('[ADMIN_MESSAGES_DEBUG] audience selected', option.value);
                      setForm((prev) => ({ ...prev, targetType: option.value, targetCustomerId: '' }));
                      setSendSuccess(false);
                      setSendError('');
                    }}
                    className={`rounded-2xl border px-3 py-3 text-xs font-bold transition-colors press-scale ${
                      active
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-white/10 bg-secondary/60 text-muted-foreground'
                    }`}
                  >
                    <AudienceIcon className="w-4 h-4 mx-auto mb-1" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Customer dropdown — only when targeting a single customer */}
          {form.targetType === 'single_customer' && (
            <label className="block text-xs text-muted-foreground">
              בחירת לקוח
              <select
                value={form.targetCustomerId}
                onChange={(e) => setForm((prev) => ({ ...prev, targetCustomerId: e.target.value }))}
                className="mt-1 w-full bg-secondary border border-border rounded-2xl px-3 py-3 text-sm text-foreground focus:outline-none focus:border-primary"
              >
                <option value="">בחר לקוח...</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name || customer.phoneNumber || customer.id}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Title */}
          <label className="block text-xs text-muted-foreground">
            כותרת
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="כותרת ההודעה"
              className="mt-1 w-full bg-secondary border border-border rounded-2xl px-3 py-3 text-sm text-foreground focus:outline-none focus:border-primary"
              dir="rtl"
            />
          </label>

          {/* Message body */}
          <label className="block text-xs text-muted-foreground">
            תוכן ההודעה
            <textarea
              value={form.message}
              onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
              placeholder="כתוב כאן את ההודעה ללקוח..."
              rows={4}
              className="mt-1 w-full bg-secondary border border-border rounded-2xl px-3 py-3 text-sm text-foreground resize-none focus:outline-none focus:border-primary"
              dir="rtl"
            />
          </label>

          {/* Preview card — shows once user types anything */}
          {(form.title.trim() || form.message.trim()) && (
            <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
              <p className="text-xs text-muted-foreground mb-2">תצוגה מקדימה</p>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-primary/15 border border-primary/25 flex-shrink-0">
                  <Bell className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-black text-sm leading-snug">
                    {form.title.trim() || 'כותרת ההודעה'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-5 line-clamp-2">
                    {form.message.trim() || 'תוכן ההודעה'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Success feedback */}
          {sendSuccess && (
            <div className="rounded-2xl border border-[#93E3BD]/30 bg-[#93E3BD]/10 p-3 text-sm text-[#93E3BD] text-right">
              ההודעה נשלחה בהצלחה
            </div>
          )}

          {/* Error feedback */}
          {sendError && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400 text-right">
              {sendError}
            </div>
          )}

          {/* Send button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={createMessageMutation.isPending}
            className="w-full rounded-2xl bg-primary py-3.5 text-sm font-black text-black press-scale disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            {createMessageMutation.isPending ? 'שולח...' : 'שלח הודעה'}
          </button>
        </div>

        {/* ===== IN-APP MESSAGE HISTORY ===== */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-black">הודעות בתוך האפליקציה</h2>
            <span className="text-xs text-muted-foreground">{customerNotifications.length} הודעות לקוח</span>
          </div>

          {inAppMessageSummaries.length === 0 ? (
            <div className="glass rounded-3xl p-8 text-center">
              <Bell className="w-12 h-12 text-primary mx-auto mb-3" />
              <h3 className="font-black text-lg mb-1">אין עדיין הודעות בתוך האפליקציה</h3>
              <p className="text-muted-foreground text-sm">
                הודעות שתשלח ללקוחות וקריאות שלהן יופיעו כאן.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {inAppMessageSummaries.slice(0, 20).map((summary) => {
                const readPercent = summary.receivedCount > 0
                  ? Math.round((summary.readCount / summary.receivedCount) * 100)
                  : 0;
                const isSingleCustomer = summary.receivedCount === 1;

                return (
                  <div key={summary.id} className="dark-card rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-black truncate">{summary.title}</h3>
                          {summary.severity === 'danger' && (
                            <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-muted-foreground text-xs">
                          {MESSAGE_TYPE_LABELS[summary.type] || 'הודעת מערכת'} · {formatTimestamp(summary.createdAt)}
                        </p>
                      </div>
                      <span className="rounded-full bg-primary/15 text-primary px-3 py-1 text-xs font-bold whitespace-nowrap">
                        {readPercent}% נקראו
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="glass rounded-xl p-3">
                        <span className="block text-muted-foreground text-xs mb-1">קיבלו</span>
                        <span className="font-black">{summary.receivedCount}</span>
                      </div>
                      <div className="glass rounded-xl p-3">
                        <span className="block text-muted-foreground text-xs mb-1">קראו</span>
                        <span className="font-black text-primary inline-flex items-center gap-1">
                          <CheckCheck className="w-4 h-4" />
                          {summary.readCount}
                        </span>
                      </div>
                    </div>

                    {isSingleCustomer && (
                      <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-muted-foreground leading-5">
                        {summary.readCount > 0 ? (
                          <>
                            הלקוח קרא את ההודעה
                            {summary.latestReadAt ? ` ב־${formatTimestamp(summary.latestReadAt)}` : ''}
                            {summary.sampleCustomerName ? ` · ${summary.sampleCustomerName}` : ''}
                            {summary.sampleCustomerPhone ? ` · ${summary.sampleCustomerPhone}` : ''}
                          </>
                        ) : (
                          'הלקוח עדיין לא סימן שקרא את ההודעה.'
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ===== PUSH JOB QUEUE ===== */}
        <div>
          <h2 className="font-black mb-3">תור התראות Push</h2>
          {jobs.length === 0 ? (
            <div className="glass rounded-3xl p-8 text-center">
              <MessageSquareText className="w-12 h-12 text-primary mx-auto mb-3" />
              <h3 className="font-black text-lg mb-1">אין הודעות בתור</h3>
              <p className="text-muted-foreground text-sm">
                כשמערכת ההתראות תיצור עבודות Push, הן יופיעו כאן.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div key={job.id} className="dark-card rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="font-black">{JOB_TYPE_LABELS[job.type] || job.type}</h3>
                      <p className="text-muted-foreground text-sm" dir="ltr">{job.phone || '-'}</p>
                    </div>
                    <span className="rounded-full bg-primary/15 text-primary px-3 py-1 text-xs font-bold">
                      {STATUS_LABELS[job.status] || job.status}
                    </span>
                  </div>

                  {job.message && (
                    <p className="glass rounded-xl p-3 text-sm text-muted-foreground mb-3 leading-6">
                      {job.message}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="glass rounded-xl p-3">
                      <span className="block text-muted-foreground text-xs mb-1">מתוזמן</span>
                      <span className="font-bold">{formatTimestamp(job.scheduledFor)}</span>
                    </div>
                    <div className="glass rounded-xl p-3">
                      <span className="block text-muted-foreground text-xs mb-1">נוצר</span>
                      <span className="font-bold">{formatTimestamp(job.createdAt)}</span>
                    </div>
                    <div className="glass rounded-xl p-3">
                      <span className="block text-muted-foreground text-xs mb-1">תור</span>
                      <span className="font-bold break-all">{job.appointmentId || '-'}</span>
                    </div>
                    <div className="glass rounded-xl p-3">
                      <span className="block text-muted-foreground text-xs mb-1">ערוץ</span>
                      <span className="font-bold">{job.channel || 'push'}</span>
                    </div>
                  </div>

                  {job.error && (
                    <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-400 text-sm">
                      {String(job.error)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
