import {
  Timestamp,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit as limitQuery,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  ensureFirebaseAdmin,
  ensureFirebaseCustomer,
  firebaseAuth,
  firebaseProjectId,
  getFirebaseFunctions,
  getFirestoreDb,
  normalizeIsraeliPhoneNumber,
} from '@/lib/firebase';

export const CUSTOMER_NOTIFICATION_TYPES = [
  'admin_custom',
  'broadcast',
  'free_slot',
  'appointment',
  'haircut_reminder',
  'warning',
  'block',
  'payment_request',
  'no_show_payment_required',
  'system',
];

export const CUSTOMER_NOTIFICATION_SEVERITIES = [
  'info',
  'success',
  'warning',
  'danger',
];

export const CUSTOMER_NOTIFICATION_TARGET_TYPES = [
  'all_customers',
  'single_customer',
  'phone',
];

const ACTIVE_NOTIFICATION_STATUSES = new Set(['unread', 'read']);
const MAX_BATCH_WRITES = 400;
const CUSTOMER_NOTIFICATION_LIMIT = 50;
const CRITICAL_NOTIFICATION_TYPES = new Set(['warning', 'block', 'payment_request', 'no_show_payment_required']);

const cleanString = (value) => String(value || '').trim();

const customerNotificationCollection = (customerId) => (
  collection(getFirestoreDb(), 'customerNotifications', customerId, 'notifications')
);

const isExpired = (notification) => {
  const expiresMs = notification.expiresAt?.toMillis?.() || 0;
  return expiresMs > 0 && Date.now() > expiresMs;
};

const normalizeExpiresAt = (value) => {
  if (!value) return null;
  if (value?.toMillis) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Timestamp.fromDate(value);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Timestamp.fromDate(parsed);
};

export const isCriticalCustomerNotification = (notification) => (
  CRITICAL_NOTIFICATION_TYPES.has(notification?.type)
  || (notification?.type === 'warning' && notification?.requiresAction === true)
);

const mapNotificationDoc = (snapshot) => {
  const data = snapshot.data() || {};
  const status = data.status || 'unread';
  const isCritical = isCriticalCustomerNotification(data);
  const type = CUSTOMER_NOTIFICATION_TYPES.includes(data.type) ? data.type : 'system';
  const severity = CUSTOMER_NOTIFICATION_SEVERITIES.includes(data.severity) ? data.severity : 'info';
  return {
    id: snapshot.id,
    customerId: snapshot.ref.parent.parent?.id || data.targetCustomerId || null,
    path: snapshot.ref.path,
    ...data,
    type,
    severity,
    title: cleanString(data.title) || 'הודעה',
    message: cleanString(data.message) || 'אין תוכן להצגה',
    status,
    isRead: status === 'read' || Boolean(data.readAt),
    isCritical,
    canDismiss: status !== 'hidden' && !isCritical,
  };
};

const buildAdminPayload = (input, target, adminUid) => {
  const type = cleanString(input.type || 'admin_custom');
  const severity = cleanString(input.severity || 'info');
  const targetType = cleanString(input.targetType || 'single_customer');
  const title = cleanString(input.title);
  const message = cleanString(input.message);

  if (!CUSTOMER_NOTIFICATION_TYPES.includes(type)) {
    throw Object.assign(new Error('סוג ההודעה לא תקין.'), {
      code: 'customer-notifications/invalid-type',
    });
  }
  if (!CUSTOMER_NOTIFICATION_SEVERITIES.includes(severity)) {
    throw Object.assign(new Error('רמת החשיבות לא תקינה.'), {
      code: 'customer-notifications/invalid-severity',
    });
  }
  if (!CUSTOMER_NOTIFICATION_TARGET_TYPES.includes(targetType)) {
    throw Object.assign(new Error('יעד ההודעה לא תקין.'), {
      code: 'customer-notifications/invalid-target',
    });
  }
  if (!title) {
    throw Object.assign(new Error('יש להזין כותרת להודעה.'), {
      code: 'customer-notifications/title-required',
    });
  }
  if (!message) {
    throw Object.assign(new Error('יש להזין תוכן הודעה.'), {
      code: 'customer-notifications/message-required',
    });
  }

  return {
    type,
    title,
    message,
    severity,
    requiresAction: input.requiresAction === true || CRITICAL_NOTIFICATION_TYPES.has(type),
    targetType,
    targetCustomerId: target.customerId || null,
    targetPhone: target.phoneNumber || input.targetPhone || null,
    status: 'unread',
    source: 'admin',
    messageBatchId: cleanString(input.messageBatchId) || null,
    createdBy: adminUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    expiresAt: normalizeExpiresAt(input.expiresAt),
    readAt: null,
    readBy: null,
    readByName: null,
    readByPhone: null,
    hiddenAt: null,
    hiddenBy: null,
  };
};

const getCustomerTargetById = async (customerId) => {
  const id = cleanString(customerId);
  if (!id) {
    throw Object.assign(new Error('יש לבחור לקוח.'), {
      code: 'customer-notifications/customer-required',
    });
  }

  const snapshot = await getDoc(doc(getFirestoreDb(), 'users', id));
  if (!snapshot.exists()) {
    throw Object.assign(new Error('הלקוח שנבחר לא נמצא.'), {
      code: 'customer-notifications/customer-not-found',
    });
  }

  const data = snapshot.data();
  return {
    customerId: snapshot.id,
    phoneNumber: data.phoneNumber || '',
  };
};

const getCustomerTargetByPhone = async (phone) => {
  let normalizedPhone;
  try {
    normalizedPhone = normalizeIsraeliPhoneNumber(phone);
  } catch {
    throw Object.assign(new Error('מספר הטלפון לא תקין.'), {
      code: 'customer-notifications/invalid-phone',
    });
  }

  const snapshot = await getDocs(query(
    collection(getFirestoreDb(), 'users'),
    where('phoneNumber', '==', normalizedPhone),
    limitQuery(2),
  ));

  if (snapshot.empty) {
    throw Object.assign(new Error('לא נמצא לקוח רשום עם מספר הטלפון הזה.'), {
      code: 'customer-notifications/customer-not-found',
    });
  }

  const first = snapshot.docs[0];
  return {
    customerId: first.id,
    phoneNumber: normalizedPhone,
  };
};

const getAllCustomerTargets = async () => {
  const snapshot = await getDocs(query(
    collection(getFirestoreDb(), 'users'),
    where('role', '==', 'customer'),
  ));

  return snapshot.docs.map((customerSnapshot) => {
    const data = customerSnapshot.data();
    return {
      customerId: customerSnapshot.id,
      phoneNumber: data.phoneNumber || '',
    };
  });
};

const commitNotificationWrites = async (targets, input, adminUid) => {
  if (targets.length === 0) {
    throw Object.assign(new Error('לא נמצאו לקוחות לשליחת ההודעה.'), {
      code: 'customer-notifications/no-targets',
    });
  }

  const messageBatchId = cleanString(input.messageBatchId)
    || doc(collection(getFirestoreDb(), 'customerNotificationBatches')).id;
  const payloadInput = { ...input, messageBatchId };

  let createdCount = 0;
  for (let start = 0; start < targets.length; start += MAX_BATCH_WRITES) {
    const batchTargets = targets.slice(start, start + MAX_BATCH_WRITES);
    const batch = writeBatch(getFirestoreDb());

    batchTargets.forEach((target) => {
      const notificationRef = doc(customerNotificationCollection(target.customerId));
      batch.set(notificationRef, buildAdminPayload(payloadInput, target, adminUid));
      createdCount += 1;
    });

    await batch.commit();
  }

  console.info('[Firestore] Admin customer notification created', JSON.stringify({
    projectId: firebaseProjectId,
    targetType: input.targetType,
    type: input.type,
    severity: input.severity,
    createdCount,
    messageBatchId,
  }));

  return { createdCount, messageBatchId };
};

export const createAdminCustomerNotification = async (input) => {
  const adminUser = await ensureFirebaseAdmin();
  const targetType = cleanString(input.targetType || 'single_customer');

  if (targetType === 'all_customers') {
    const targets = await getAllCustomerTargets();
    return commitNotificationWrites(targets, input, adminUser.uid);
  }

  if (targetType === 'phone') {
    const target = await getCustomerTargetByPhone(input.targetPhone);
    return commitNotificationWrites([target], input, adminUser.uid);
  }

  const target = await getCustomerTargetById(input.targetCustomerId);
  return commitNotificationWrites([target], input, adminUser.uid);
};

export const createBroadcastCustomerNotification = async (input) => (
  createAdminCustomerNotification({
    ...input,
    type: input.type || 'broadcast',
    targetType: 'all_customers',
  })
);

export const createFreeSlotCustomerNotification = async (input) => (
  createAdminCustomerNotification({
    ...input,
    type: 'free_slot',
    severity: input.severity || 'success',
  })
);

export const subscribeToCurrentCustomerNotifications = (onData, onError) => {
  let unsubscribe = () => {};
  let cancelled = false;

  ensureFirebaseCustomer()
    .then((firebaseUser) => {
      if (cancelled) return;

      unsubscribe = onSnapshot(
        query(
          customerNotificationCollection(firebaseUser.uid),
          orderBy('createdAt', 'desc'),
          limitQuery(CUSTOMER_NOTIFICATION_LIMIT),
        ),
        (snapshot) => {
          const notifications = snapshot.docs
            .map(mapNotificationDoc)
            .filter((notification) => (
              ACTIVE_NOTIFICATION_STATUSES.has(notification.status)
              && notification.archivedFromInbox !== true
              && !isExpired(notification)
            ));

          console.info('[Firestore] Customer notifications snapshot received', JSON.stringify({
            projectId: firebaseProjectId,
            uid: firebaseUser.uid,
            size: snapshot.size,
            visibleCount: notifications.length,
          }));

          onData(notifications);
        },
        onError,
      );
    })
    .catch(onError);

  return () => {
    cancelled = true;
    unsubscribe();
  };
};

const getCurrentCustomerReceipt = async (firebaseUser) => {
  const profileSnapshot = await getDoc(doc(getFirestoreDb(), 'users', firebaseUser.uid));
  const profile = profileSnapshot.exists() ? profileSnapshot.data() : {};
  const firstName = cleanString(profile.firstName);
  const lastName = cleanString(profile.lastName);
  const fallbackName = cleanString(profile.name || profile.displayName);
  const fullName = cleanString(`${firstName} ${lastName}`) || fallbackName || null;

  return {
    uid: firebaseUser.uid,
    name: fullName,
    phone: cleanString(profile.phoneNumber || profile.phone || firebaseUser.phoneNumber) || null,
  };
};

const readReceiptFields = (receipt) => ({
  status: 'read',
  readAt: serverTimestamp(),
  readBy: receipt.uid,
  readByName: receipt.name,
  readByPhone: receipt.phone,
  updatedAt: serverTimestamp(),
});

export const markCustomerNotificationRead = async (notificationId) => {
  const firebaseUser = await ensureFirebaseCustomer();
  const id = cleanString(notificationId);
  if (!id) return;
  const receipt = await getCurrentCustomerReceipt(firebaseUser);

  await updateDoc(
    doc(getFirestoreDb(), 'customerNotifications', firebaseUser.uid, 'notifications', id),
    readReceiptFields(receipt),
  );
};

export const hideCustomerNotification = async (notificationId) => {
  const firebaseUser = await ensureFirebaseCustomer();
  const id = cleanString(notificationId);
  if (!id) return;
  const notificationRef = doc(getFirestoreDb(), 'customerNotifications', firebaseUser.uid, 'notifications', id);
  const notificationSnapshot = await getDoc(notificationRef);
  if (!notificationSnapshot.exists()) return;

  if (isCriticalCustomerNotification(notificationSnapshot.data())) {
    throw Object.assign(new Error('לא ניתן למחוק התראה חשובה. אפשר לסמן שקראת אותה בלבד.'), {
      code: 'customer-notifications/critical-cannot-dismiss',
    });
  }

  await updateDoc(notificationRef, {
    status: 'hidden',
    hiddenAt: serverTimestamp(),
    hiddenBy: firebaseUser.uid,
    updatedAt: serverTimestamp(),
  });
};

export const markCustomerNotificationsRead = async (notificationIds) => {
  const firebaseUser = await ensureFirebaseCustomer();
  const ids = [...new Set((notificationIds || []).map(cleanString).filter(Boolean))];
  if (ids.length === 0) return;
  const receipt = await getCurrentCustomerReceipt(firebaseUser);

  for (let start = 0; start < ids.length; start += MAX_BATCH_WRITES) {
    const batch = writeBatch(getFirestoreDb());
    ids.slice(start, start + MAX_BATCH_WRITES).forEach((id) => {
      batch.update(
        doc(getFirestoreDb(), 'customerNotifications', firebaseUser.uid, 'notifications', id),
        readReceiptFields(receipt),
      );
    });
    await batch.commit();
  }
};

export const sendAdminCustomerMessage = async (input) => {
  await ensureFirebaseAdmin();
  const callable = httpsCallable(getFirebaseFunctions(), 'sendAdminCustomerMessage');
  const result = await callable(input);
  return result.data;
};

const hideNotificationRefs = async (firebaseUser, ids) => {
  const uniqueIds = [...new Set((ids || []).map(cleanString).filter(Boolean))];
  if (uniqueIds.length === 0) return 0;

  let hiddenCount = 0;
  for (let start = 0; start < uniqueIds.length; start += MAX_BATCH_WRITES) {
    const batch = writeBatch(getFirestoreDb());
    uniqueIds.slice(start, start + MAX_BATCH_WRITES).forEach((id) => {
      batch.update(
        doc(getFirestoreDb(), 'customerNotifications', firebaseUser.uid, 'notifications', id),
        {
          status: 'hidden',
          hiddenAt: serverTimestamp(),
          hiddenBy: firebaseUser.uid,
          updatedAt: serverTimestamp(),
        },
      );
      hiddenCount += 1;
    });
    await batch.commit();
  }
  return hiddenCount;
};

export const clearReadCustomerNotifications = async () => {
  const firebaseUser = await ensureFirebaseCustomer();
  const snapshot = await getDocs(query(
    customerNotificationCollection(firebaseUser.uid),
    where('status', '==', 'read'),
    limitQuery(CUSTOMER_NOTIFICATION_LIMIT),
  ));
  const ids = snapshot.docs
    .map(mapNotificationDoc)
    .filter((notification) => notification.canDismiss && !notification.isCritical)
    .map((notification) => notification.id);
  return hideNotificationRefs(firebaseUser, ids);
};

export const clearCompletedAppointmentNotifications = async () => {
  const firebaseUser = await ensureFirebaseCustomer();
  const snapshot = await getDocs(query(
    customerNotificationCollection(firebaseUser.uid),
    orderBy('createdAt', 'desc'),
    limitQuery(CUSTOMER_NOTIFICATION_LIMIT),
  ));
  const terminalStatuses = new Set(['completed', 'cancelled', 'rejected', 'no_show']);
  const ids = snapshot.docs
    .map(mapNotificationDoc)
    .filter((notification) => (
      notification.type === 'appointment'
      && notification.canDismiss
      && terminalStatuses.has(notification.appointmentStatus || notification.statusType || notification.eventStatus)
    ))
    .map((notification) => notification.id);
  return hideNotificationRefs(firebaseUser, ids);
};

export const updateCustomerNotificationStatus = async (notificationId, status) => {
  const nextStatus = cleanString(status);
  if (!['unread', 'read', 'hidden'].includes(nextStatus)) {
    throw Object.assign(new Error('סטטוס ההודעה לא תקין.'), {
      code: 'customer-notifications/invalid-status',
    });
  }

  if (nextStatus === 'read') return markCustomerNotificationRead(notificationId);
  if (nextStatus === 'hidden') return hideCustomerNotification(notificationId);

  const firebaseUser = await ensureFirebaseCustomer();
  await updateDoc(doc(getFirestoreDb(), 'customerNotifications', firebaseUser.uid, 'notifications', notificationId), {
    status: 'unread',
    readAt: null,
    hiddenAt: null,
    updatedAt: serverTimestamp(),
  });
};

export const subscribeToAdminCustomerNotifications = (onData, onError) => {
  let unsubscribe = () => {};
  let cancelled = false;

  ensureFirebaseAdmin()
    .then((adminUser) => {
      if (cancelled) return;

      unsubscribe = onSnapshot(
        query(
          collectionGroup(getFirestoreDb(), 'notifications'),
          orderBy('createdAt', 'desc'),
          limitQuery(CUSTOMER_NOTIFICATION_LIMIT),
        ),
        (snapshot) => {
          const notifications = snapshot.docs
            .filter((notificationSnapshot) => (
              notificationSnapshot.ref.parent.parent?.parent?.id === 'customerNotifications'
            ))
            .map(mapNotificationDoc)
            .filter((notification) => notification.archivedFromInbox !== true)
            .sort((left, right) => {
              const leftTime = left.createdAt?.toMillis?.() || 0;
              const rightTime = right.createdAt?.toMillis?.() || 0;
              return rightTime - leftTime;
            });

          console.info('[Firestore] Admin customer notifications snapshot received', JSON.stringify({
            projectId: firebaseProjectId,
            uid: adminUser.uid,
            size: snapshot.size,
          }));

          onData(notifications);
        },
        onError,
      );
    })
    .catch(onError);

  return () => {
    cancelled = true;
    unsubscribe();
  };
};

export const getCurrentAdminUidForNotifications = () => firebaseAuth.currentUser?.uid || null;
