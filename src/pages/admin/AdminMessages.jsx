import React from 'react';
import { ArrowRight, MessageSquareText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { subscribeToAdminNotificationJobs } from '@/lib/notificationJobsFirestore';
import { DATA_LOAD_ERROR_MESSAGE, getUserFacingErrorMessage } from '@/lib/userFacingErrors';

const STATUS_LABELS = {
  pending: 'ממתין לשליחה',
  sent: 'נשלח',
  failed: 'נכשל',
};

const TYPE_LABELS = {
  appointment_created_admin: 'תור חדש למנהל',
  appointment_approved: 'אישור תור ללקוח',
  appointment_reminder_24h: 'תזכורת 24 שעות',
  appointment_reminder_2h: 'תזכורת שעתיים',
  appointment_cancelled: 'ביטול תור',
  waiting_list_slot_available: 'תור התפנה לרשימת המתנה',
  waiting_list_manual_notify: 'הודעה ידנית לרשימת המתנה',
  waiting_list_manual_sms_notify: 'SMS ידני לרשימת המתנה',
};

const formatTimestamp = (timestamp) => {
  if (!timestamp?.toDate) return '-';
  return timestamp.toDate().toLocaleString('he-IL', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
};

export default function AdminMessages() {
  const navigate = useNavigate();
  const [jobs, setJobs] = React.useState([]);
  const [error, setError] = React.useState('');

  React.useEffect(() => subscribeToAdminNotificationJobs(
    setJobs,
    (listenerError) => {
      console.error('[Firestore] Admin notification jobs listener failed', {
        code: listenerError?.code || 'unknown',
        message: listenerError?.message || 'Unknown Firestore error',
      });
      setError(getUserFacingErrorMessage(listenerError, DATA_LOAD_ERROR_MESSAGE));
    },
  ), []);

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky top-0 z-30 glass border-b border-white/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin')} className="press-scale">
            <ArrowRight className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl font-black">הודעות</h1>
            <p className="text-muted-foreground text-xs">מעקב אחרי עבודות WhatsApp ותזכורות</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-4">
        <div className="glass-gold rounded-2xl p-4 text-sm text-muted-foreground leading-6">
          זהו תור הודעות בלבד. שליחת WhatsApp בפועל דורשת חיבור ספק כמו WhatsApp Cloud API, Twilio WhatsApp או WATI דרך backend.
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        {jobs.length === 0 ? (
          <div className="glass rounded-3xl p-8 text-center">
            <MessageSquareText className="w-12 h-12 text-primary mx-auto mb-3" />
            <h2 className="font-black text-lg mb-1">אין הודעות בתור</h2>
            <p className="text-muted-foreground text-sm">כשמערכת ההתראות תיצור עבודות, הן יופיעו כאן.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <div key={job.id} className="dark-card rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-black">{TYPE_LABELS[job.type] || job.type}</h3>
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
  );
}
