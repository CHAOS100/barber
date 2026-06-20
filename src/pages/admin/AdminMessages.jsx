import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowRight,
  Bell,
  CheckCheck,
  MessageSquareText,
  Phone,
  Plus,
  Send,
  ShieldAlert,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { subscribeToAdminNotificationJobs } from '@/lib/notificationJobsFirestore';
import { subscribeToAllCustomerProfiles } from '@/lib/customerProfilesFirestore';
import { createAdminCustomerNotification, subscribeToAdminCustomerNotifications } from '@/lib/customerNotificationsFirestore';
import { toast } from '@/components/ui/use-toast';
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
  waiting_list_manual_sms_notify: 'SMS ידני לרשימת המתנה',
};

const MESSAGE_TYPE_OPTIONS = [
  { value: 'admin_custom', label: 'הודעה אישית מהעסק' },
  { value: 'broadcast', label: 'עדכון כללי / הודעה לכלל הלקוחות' },
  { value: 'free_slot', label: 'תור שהתפנה' },
  { value: 'warning', label: 'אזהרה' },
  { value: 'block', label: 'הודעת חסימה' },
  { value: 'payment_request', label: 'דרישת תשלום / אי הגעה' },
  { value: 'no_show_payment_required', label: 'תשלום נדרש עקב אי-הגעה' },
  { value: 'appointment', label: 'עדכון תור' },
  { value: 'system', label: 'עדכון מערכת' },
];

const SEVERITY_OPTIONS = [
  { value: 'info', label: 'מידע רגיל' },
  { value: 'success', label: 'חיובי / הצלחה' },
  { value: 'warning', label: 'חשוב' },
  { value: 'danger', label: 'דחוף' },
];

const TARGET_OPTIONS = [
  { value: 'all_customers', label: 'כל הלקוחות', Icon: Users },
  { value: 'single_customer', label: 'לקוח מסוים', Icon: UserRound },
  { value: 'phone', label: 'לפי טלפון', Icon: Phone },
];

const INITIAL_FORM = {
  type: 'admin_custom',
  severity: 'info',
  targetType: 'all_customers',
  targetCustomerId: '',
  targetPhone: '',
  title: '',
  message: '',
  expiresAt: '',
  requiresAction: false,
};

const MESSAGE_TYPE_LABELS = MESSAGE_TYPE_OPTIONS.reduce((labels, option) => ({
  ...labels,
  [option.value]: option.label,
}), {});

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

function AdminMessageModal({ customers, form, setForm, onClose, onSubmit, loading }) {
  const selectedTarget = TARGET_OPTIONS.find((option) => option.value === form.targetType);
  const TargetIcon = selectedTarget?.Icon || Users;

  return (
    <div
      className="keyboard-safe-overlay fixed inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-md"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="keyboard-safe-modal dark-card rounded-3xl p-5 w-full max-w-md overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <div className="w-12 h-12 glass-gold rounded-2xl flex items-center justify-center mb-3">
              <Send className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-xl font-black">שליחת הודעה ללקוחות</h2>
            <p className="text-muted-foreground text-sm mt-1">
              ההודעה תופיע בתוך האפליקציה אצל הלקוחות שנבחרו.
            </p>
          </div>
          <button type="button" onClick={onClose} className="glass p-2 rounded-xl press-scale">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-xs text-muted-foreground">
            סוג הודעה
            <select
              value={form.type}
              onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
              className="mt-1 w-full bg-secondary border border-border rounded-2xl px-3 py-3 text-sm text-foreground focus:outline-none focus:border-primary"
            >
              {MESSAGE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-muted-foreground">
            רמת חשיבות
            <select
              value={form.severity}
              onChange={(event) => setForm((prev) => ({ ...prev, severity: event.target.value }))}
              className="mt-1 w-full bg-secondary border border-border rounded-2xl px-3 py-3 text-sm text-foreground focus:outline-none focus:border-primary"
            >
              {SEVERITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div>
            <p className="text-xs text-muted-foreground mb-2">למי לשלוח?</p>
            <div className="grid grid-cols-3 gap-2">
              {TARGET_OPTIONS.map((option) => {
                const OptionIcon = option.Icon;
                const active = form.targetType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, targetType: option.value }))}
                    className={`rounded-2xl border px-2 py-3 text-xs font-bold transition-colors press-scale ${
                      active
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-white/10 bg-secondary/60 text-muted-foreground'
                    }`}
                  >
                    <OptionIcon className="w-4 h-4 mx-auto mb-1" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {form.targetType === 'single_customer' && (
            <label className="block text-xs text-muted-foreground">
              בחירת לקוח
              <select
                value={form.targetCustomerId}
                onChange={(event) => setForm((prev) => ({ ...prev, targetCustomerId: event.target.value }))}
                className="mt-1 w-full bg-secondary border border-border rounded-2xl px-3 py-3 text-sm text-foreground focus:outline-none focus:border-primary"
              >
                <option value="">בחר לקוח</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name || customer.phoneNumber || customer.id}
                  </option>
                ))}
              </select>
            </label>
          )}

          {form.targetType === 'phone' && (
            <label className="block text-xs text-muted-foreground">
              מספר טלפון של לקוח רשום
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.targetPhone}
                onChange={(event) => setForm((prev) => ({ ...prev, targetPhone: event.target.value }))}
                placeholder="טלפון לקוח"
                className="mt-1 w-full bg-secondary border border-border rounded-2xl px-3 py-3 text-sm text-foreground text-left focus:outline-none focus:border-primary"
                dir="ltr"
                style={{ textAlign: 'left' }}
              />
            </label>
          )}

          <label className="block text-xs text-muted-foreground">
            כותרת
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              className="mt-1 w-full bg-secondary border border-border rounded-2xl px-3 py-3 text-sm text-foreground focus:outline-none focus:border-primary"
              dir="rtl"
            />
          </label>

          <label className="block text-xs text-muted-foreground">
            תוכן ההודעה
            <textarea
              value={form.message}
              onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
              rows={4}
              className="mt-1 w-full bg-secondary border border-border rounded-2xl px-3 py-3 text-sm text-foreground resize-none focus:outline-none focus:border-primary"
              dir="rtl"
            />
          </label>

          <label className="block text-xs text-muted-foreground">
            תוקף הודעה, אופציונלי
            <input
              type="datetime-local"
              value={form.expiresAt}
              onChange={(event) => setForm((prev) => ({ ...prev, expiresAt: event.target.value }))}
              className="mt-1 w-full bg-secondary border border-border rounded-2xl px-3 py-3 text-sm text-foreground focus:outline-none focus:border-primary"
            />
          </label>

          {form.type === 'warning' && (
            <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-3 text-xs text-muted-foreground leading-5">
              אזהרות הן התראות חשובות: הלקוח יכול לסמן שקרא, אבל לא למחוק אותן בעצמו.
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-primary py-3.5 text-sm font-black text-black press-scale disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <TargetIcon className="w-4 h-4" />
            {loading ? 'שולח...' : 'שלח הודעה'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminMessages() {
  const navigate = useNavigate();
  const [jobs, setJobs] = React.useState([]);
  const [customers, setCustomers] = React.useState([]);
  const [customerNotifications, setCustomerNotifications] = React.useState([]);
  const [error, setError] = React.useState('');
  const [modalOpen, setModalOpen] = React.useState(false);
  const [form, setForm] = React.useState(INITIAL_FORM);

  React.useEffect(() => subscribeToAdminNotificationJobs(
    setJobs,
    (listenerError) => {
      console.error('[Firestore] Admin notification jobs listener failed', JSON.stringify({
        code: listenerError?.code || 'unknown',
        message: listenerError?.message || 'Unknown Firestore error',
      }));
      setError(getUserFacingErrorMessage(listenerError, DATA_LOAD_ERROR_MESSAGE));
    },
  ), []);

  React.useEffect(() => subscribeToAllCustomerProfiles(
    setCustomers,
    (listenerError) => {
      console.warn('[Firestore] Admin customer list for messages failed', JSON.stringify({
        code: listenerError?.code || 'unknown',
        message: listenerError?.message || 'Unknown customer listener error',
      }));
    },
  ), []);

  React.useEffect(() => subscribeToAdminCustomerNotifications(
    setCustomerNotifications,
    (listenerError) => {
      console.warn('[Firestore] Admin customer notifications listener failed', JSON.stringify({
        code: listenerError?.code || 'unknown',
        message: listenerError?.message || 'Unknown customer notifications listener error',
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
      current.sampleCustomerPhone = current.sampleCustomerPhone || notification.readByPhone || notification.targetPhone || '';

      byBatch.set(key, current);
    });

    return [...byBatch.values()].sort((left, right) => {
      const leftTime = left.createdAt?.toMillis?.() || 0;
      const rightTime = right.createdAt?.toMillis?.() || 0;
      return rightTime - leftTime;
    });
  }, [customerNotifications]);

  const createMessageMutation = useMutation({
    mutationFn: createAdminCustomerNotification,
    onSuccess: (result) => {
      toast({
        title: 'ההודעה נשמרה',
        description: `נוצרו ${result.createdCount} הודעות לקוח.`,
      });
      setForm(INITIAL_FORM);
      setModalOpen(false);
    },
    onError: (mutationError) => {
      toast({
        variant: 'destructive',
        title: 'שליחת ההודעה נכשלה',
        description: getCleanErrorMessage(mutationError),
      });
    },
  });

  const submitMessage = (event) => {
    event.preventDefault();
    createMessageMutation.mutate(form);
  };

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky top-0 z-30 glass border-b border-white/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/admin')} className="press-scale">
            <ArrowRight className="w-6 h-6" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-black">הודעות</h1>
            <p className="text-muted-foreground text-xs">הודעות ללקוחות ומעקב אחרי התראות חיצוניות</p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded-2xl bg-primary px-3 py-2 text-xs font-black text-black press-scale flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            שליחת הודעה ללקוחות
          </button>
        </div>
      </div>

      <div className="px-4 py-6 space-y-4">
        <div className="glass-gold rounded-2xl p-4 text-sm text-muted-foreground leading-6">
          הודעות בתוך האפליקציה נשמרות ללקוחות ב־Firestore. שליחת SMS/WhatsApp בפועל עדיין תלויה בחיבור ספק הודעות חיצוני דרך backend.
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="w-full rounded-3xl border border-primary/25 bg-primary/10 p-4 text-right press-scale"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center">
              <Bell className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-black">שליחת הודעה ללקוחות</h2>
              <p className="text-muted-foreground text-sm mt-1">
                הודעה לכל הלקוחות, ללקוח מסוים או לפי מספר טלפון של לקוח רשום.
              </p>
            </div>
            <Plus className="w-5 h-5 text-primary" />
          </div>
        </button>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
            {error}
          </div>
        )}

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
                          {summary.severity === 'danger' && <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0" />}
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

        <div>
          <h2 className="font-black mb-3">תור הודעות חיצוניות</h2>
          {jobs.length === 0 ? (
            <div className="glass rounded-3xl p-8 text-center">
              <MessageSquareText className="w-12 h-12 text-primary mx-auto mb-3" />
              <h3 className="font-black text-lg mb-1">אין הודעות בתור</h3>
              <p className="text-muted-foreground text-sm">
                כשמערכת ההתראות תיצור עבודות SMS/WhatsApp, הן יופיעו כאן.
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
                      <span className="font-bold">{job.channel || 'whatsapp'}</span>
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

      {modalOpen && (
        <AdminMessageModal
          customers={customers}
          form={form}
          setForm={setForm}
          onClose={() => setModalOpen(false)}
          onSubmit={submitMessage}
          loading={createMessageMutation.isPending}
        />
      )}
    </div>
  );
}
