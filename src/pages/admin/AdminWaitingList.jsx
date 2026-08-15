import React from 'react';
import { ArrowRight, BellRing, Calendar, Trash2, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import GoldButton from '@/components/ui/GoldButton';
import { toast } from '@/components/ui/use-toast';
import { getUserFacingErrorMessage } from '@/lib/userFacingErrors';
import { localDateToString } from '@/lib/slotEngine';
import {
  cancelWaitingListEntryByAdmin,
  deleteWaitingListEntryByAdmin,
  manuallyNotifyWaitingListEntry,
  subscribeToAdminWaitingList,
} from '@/lib/waitingListFirestore';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const STATUS_OPTIONS = [
  { value: 'active', label: 'פעילים' },
  { value: 'notified', label: 'קיבלו הודעה' },
  { value: 'booked', label: 'הוזמנו' },
  { value: 'cancelled', label: 'בוטלו' },
  { value: 'expired', label: 'פג תוקף' },
  { value: 'all', label: 'הכל' },
];

const STATUS_LABELS = {
  active: 'פעיל',
  notified: 'נשלחה הודעה',
  booked: 'הוזמן',
  cancelled: 'בוטל',
  expired: 'פג תוקף',
};

const DAY_PART_LABELS = {
  morning: 'בוקר',
  noon: 'צהריים',
  evening: 'ערב',
};

const preferenceText = (entry) => {
  if (entry.preferenceType === 'exact_time') return `שעה מדויקת: ${entry.exactTime || '-'}`;
  if (entry.preferenceType === 'time_range') return `טווח: ${entry.startTime || '-'}-${entry.endTime || '-'}`;
  if (entry.preferenceType === 'day_part') return `חלק ביום: ${DAY_PART_LABELS[entry.dayPart] || entry.dayPart || '-'}`;
  return 'כל היום';
};

const formatTimestamp = (timestamp) => {
  if (!timestamp?.toDate) return '-';
  return timestamp.toDate().toLocaleString('he-IL', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
};

export default function AdminWaitingList() {
  const navigate = useNavigate();
  const [date, setDate] = React.useState(localDateToString());
  const [status, setStatus] = React.useState('active');
  const [entries, setEntries] = React.useState([]);
  const [error, setError] = React.useState('');
  const [busyId, setBusyId] = React.useState('');
  const [entryToDelete, setEntryToDelete] = React.useState(null);

  const todayStr = localDateToString();
  // Defensive: hide past-dated entries from the 'active'/'notified' views while the
  // scheduled expiry function (scheduledWaitlistExpiry) may not have run yet.
  const displayEntries = React.useMemo(() => {
    if (status !== 'active' && status !== 'notified' && status !== 'all') return entries;
    return entries.filter((entry) => !entry.date || entry.date >= todayStr);
  }, [entries, status, todayStr]);

  React.useEffect(() => {
    setError('');
    return subscribeToAdminWaitingList(
      date,
      status,
      setEntries,
      (listenerError) => {
        console.error('[Firestore] Admin waiting list listener failed', {
          code: listenerError?.code || 'unknown',
          message: listenerError?.message || 'Unknown Firestore error',
        });
        setError(getUserFacingErrorMessage(listenerError, 'לא הצלחנו לטעון את רשימת ההמתנה.'));
      },
    );
  }, [date, status]);

  const runAction = async (entryId, action, successTitle) => {
    if (busyId === entryId) return false;
    setBusyId(entryId);
    try {
      const result = await action(entryId);
      if (result?.channel === 'push') {
        toast({
          title: 'התראה נוצרה',
          description: 'נוצרה הודעה באפליקציה ונוספה התראת Push לשליחה.',
        });
      } else {
        toast({ title: successTitle });
      }
      return true;
    } catch (actionError) {
      toast({
        variant: 'destructive',
        title: 'הפעולה נכשלה',
        description: getUserFacingErrorMessage(actionError),
      });
      return false;
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="min-h-screen bg-background page-transition" dir="rtl">
      <div className="sticky-top-safe z-[var(--z-sticky-nav)] glass border-b border-white/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin')} className="icon-btn press-scale -mr-2" aria-label="חזרה לניהול">
            <ArrowRight className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl font-black">רשימת המתנה</h1>
            <p className="text-muted-foreground text-xs">לקוחות שמחכים לתור שהתפנה</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-4">
        <div className="glass rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="text-sm font-bold">
            תאריך
            <div className="flex gap-2 mt-2 min-w-0">
              <div className="relative flex-1 min-w-0">
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  disabled={!date}
                  className="w-full min-w-0 bg-secondary border border-border rounded-xl px-3 py-3 pr-10 text-right focus:outline-none focus:border-primary disabled:opacity-50"
                />
              </div>
              <button
                type="button"
                onClick={() => setDate(date ? '' : localDateToString())}
                className={`flex-shrink-0 whitespace-nowrap px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  !date ? 'gold-gradient text-black' : 'glass text-muted-foreground'
                }`}
              >
                כל הזמן
              </button>
            </div>
          </div>
          <label className="text-sm font-bold">
            סטטוס
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="mt-2 w-full bg-secondary border border-border rounded-xl px-3 py-3 text-right focus:outline-none focus:border-primary"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <div className="banner-error">
            {error}
          </div>
        )}

        {displayEntries.length === 0 ? (
          <div className="glass premium-empty-state rounded-3xl p-8 text-center">
            <BellRing className="w-12 h-12 text-primary mx-auto mb-3" />
            <h2 className="font-black text-lg mb-1">אין רשומות המתנה</h2>
            <p className="text-muted-foreground text-sm">כשלקוחות יצטרפו לרשימה, הם יופיעו כאן.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayEntries.map((entry) => (
              <div key={entry.id} className="dark-card rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-black">{entry.customerName || 'לקוח'}</h3>
                    <p className="text-muted-foreground text-sm" dir="ltr">{entry.phoneNumber || '-'}</p>
                  </div>
                  <span className="status-pill status-pill--accent">
                    {STATUS_LABELS[entry.status] || entry.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                  <div className="glass rounded-xl p-3">
                    <span className="block text-muted-foreground text-xs mb-1">שירות</span>
                    <span className="font-bold">{entry.serviceName || 'כל שירות'}</span>
                  </div>
                  <div className="glass rounded-xl p-3">
                    <span className="block text-muted-foreground text-xs mb-1">העדפה</span>
                    <span className="font-bold">{preferenceText(entry)}</span>
                  </div>
                  <div className="glass rounded-xl p-3">
                    <span className="block text-muted-foreground text-xs mb-1">נוצר</span>
                    <span className="font-bold">{formatTimestamp(entry.createdAt)}</span>
                  </div>
                  <div className="glass rounded-xl p-3">
                    <span className="block text-muted-foreground text-xs mb-1">הודעה אחרונה</span>
                    <span className="font-bold">{formatTimestamp(entry.notifiedAt)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <GoldButton
                    size="sm"
                    onClick={() => runAction(entry.id, manuallyNotifyWaitingListEntry, 'ההתראה נשלחה / נוספה לשליחה בהצלחה.')}
                    disabled={busyId === entry.id}
                    className="w-full"
                  >
                    הודע
                  </GoldButton>
                  <button
                    type="button"
                    onClick={() => runAction(entry.id, cancelWaitingListEntryByAdmin, 'הרשומה בוטלה')}
                    disabled={busyId === entry.id || entry.status === 'cancelled'}
                    className="rounded-xl glass px-3 py-2 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <XCircle className="w-4 h-4" />
                    בטל
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntryToDelete(entry)}
                    disabled={busyId === entry.id}
                    className="rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 px-3 py-2 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-4 h-4" />
                    מחק
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(entryToDelete)}
        title="מחיקת רשומת המתנה"
        description={`למחוק את בקשת ההמתנה של ${entryToDelete?.customerName || 'הלקוח'}? הפעולה אינה ניתנת לביטול.`}
        confirmLabel="מחק רשומה"
        onClose={() => setEntryToDelete(null)}
        busy={Boolean(entryToDelete && busyId === entryToDelete.id)}
        onConfirm={async () => {
          if (!entryToDelete) return;
          const deleted = await runAction(entryToDelete.id, deleteWaitingListEntryByAdmin, 'הרשומה נמחקה');
          if (deleted) setEntryToDelete(null);
        }}
      />
    </div>
  );
}
