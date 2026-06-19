import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  ensureFirebaseCustomer,
  getFirestoreDb,
} from '@/lib/firebase';

const ACTIVE_STATUSES = ['active', 'sent', 'published'];
const BROADCAST_TARGETS = ['all', 'customers', 'all_customers'];

const isExpired = (data) => {
  const ms = data.expiresAt?.toMillis?.() || 0;
  return ms > 0 && Date.now() > ms;
};

const mapDoc = (docSnap) => ({ id: docSnap.id, ...docSnap.data() });

/**
 * Subscribe to admin-created messages for this customer + broadcasts.
 * Handles permission-denied gracefully (empty result until rules are deployed).
 *
 * Required Firestore rules (not yet deployed):
 *   match /customerMessages/{msgId} {
 *     allow read: if isAdmin()
 *       || (isPhoneCustomer() && (
 *            resource.data.customerId == request.auth.uid
 *            || resource.data.target in ['all', 'customers', 'all_customers']
 *          ));
 *     allow write: if isAdmin();
 *   }
 */
export const subscribeToCustomerAdminMessages = (customerId, onData, onError) => {
  if (!customerId) {
    onData([]);
    return () => {};
  }

  let unsubPersonal = () => {};
  let unsubBroadcast = () => {};
  let cancelled = false;
  let personal = [];
  let broadcast = [];
  let rulesBlocked = false;

  const flush = () => {
    if (rulesBlocked) return;
    const seen = new Set();
    const merged = [...personal, ...broadcast].filter((m) => {
      if (seen.has(m.id) || isExpired(m)) return false;
      seen.add(m.id);
      return true;
    });
    onData(merged);
  };

  const handlePermissionDenied = () => {
    rulesBlocked = true;
    console.info('[customerMessages] rules not yet deployed — admin messages require Firestore rules update');
    onData([]);
  };

  ensureFirebaseCustomer()
    .then(() => {
      if (cancelled) return;

      unsubPersonal = onSnapshot(
        query(
          collection(getFirestoreDb(), 'customerMessages'),
          where('customerId', '==', customerId),
          where('status', 'in', ACTIVE_STATUSES),
        ),
        (snap) => { personal = snap.docs.map(mapDoc); flush(); },
        (err) => {
          if (err?.code === 'permission-denied') { handlePermissionDenied(); return; }
          onError(err);
        },
      );

      unsubBroadcast = onSnapshot(
        query(
          collection(getFirestoreDb(), 'customerMessages'),
          where('target', 'in', BROADCAST_TARGETS),
          where('status', 'in', ACTIVE_STATUSES),
        ),
        (snap) => { broadcast = snap.docs.map(mapDoc); flush(); },
        (err) => {
          if (err?.code === 'permission-denied') return; // already handled above
          onError(err);
        },
      );
    })
    .catch(onError);

  return () => {
    cancelled = true;
    unsubPersonal();
    unsubBroadcast();
  };
};

/**
 * Subscribe to this customer's waitingList entries with status='notified'.
 * Already allowed by existing Firestore rules (ownsWaitingListEntry).
 * Converts each entry to a standard customer message shape.
 */
export const subscribeToCustomerWaitingListAlerts = (onData, onError) => {
  let unsub = () => {};
  let cancelled = false;

  ensureFirebaseCustomer()
    .then((firebaseUser) => {
      if (cancelled) return;

      unsub = onSnapshot(
        query(
          collection(getFirestoreDb(), 'waitingList'),
          where('customerId', '==', firebaseUser.uid),
          where('status', '==', 'notified'),
        ),
        (snap) => {
          const alerts = snap.docs.map((docSnap) => {
            const d = docSnap.data();
            const parts = [];
            if (d.date) parts.push(`תאריך: ${d.date}`);
            if (d.availableStartTime) parts.push(`שעה: ${d.availableStartTime}`);
            if (d.serviceName) parts.push(`שירות: ${d.serviceName}`);
            if (d.barberName) parts.push(`ספר: ${d.barberName}`);

            return {
              id: `wl_${docSnap.id}`,
              type: 'free_slot',
              title: 'התפנה תור מתאים',
              message: parts.length > 0
                ? parts.join(' · ')
                : 'נפתח תור חדש שמתאים לבקשתך — הזדרז לפני שיתפס!',
              severity: 'success',
              source: 'waiting_list',
              createdAt: d.notifiedAt || d.updatedAt || d.createdAt || null,
              waitingListEntryId: docSnap.id,
            };
          });
          onData(alerts);
        },
        onError,
      );
    })
    .catch(onError);

  return () => {
    cancelled = true;
    unsub();
  };
};
