import {
  Timestamp,
  collection,
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
import {
  ensureFirebaseAdmin,
  ensureFirebaseCustomer,
  firebaseAuth,
  firebaseProjectId,
  getFirestoreDb,
  normalizeIsraeliPhoneNumber,
} from '@/lib/firebase';

export const CUSTOMER_NOTIFICATION_TYPES = [
  'admin_custom',
  'broadcast',
  'free_slot',
  'appointment',
  'warning',
  'block',
  'payment_request',
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

const mapNotificationDoc = (snapshot) => {
  const data = snapshot.data();
  const status = data.status || 'unread';
  return {
    id: snapshot.id,
    ...data,
    status,
    isRead: status === 'read' || Boolean(data.readAt),
    canDismiss: status !== 'hidden',
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
    targetType,
    targetCustomerId: target.customerId || null,
    targetPhone: target.phoneNumber || input.targetPhone || null,
    status: 'unread',
    source: 'admin',
    createdBy: adminUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    expiresAt: normalizeExpiresAt(input.expiresAt),
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

  let createdCount = 0;
  for (let start = 0; start < targets.length; start += MAX_BATCH_WRITES) {
    const batchTargets = targets.slice(start, start + MAX_BATCH_WRITES);
    const batch = writeBatch(getFirestoreDb());

    batchTargets.forEach((target) => {
      const notificationRef = doc(customerNotificationCollection(target.customerId));
      batch.set(notificationRef, buildAdminPayload(input, target, adminUid));
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
  }));

  return { createdCount };
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
        ),
        (snapshot) => {
          const notifications = snapshot.docs
            .map(mapNotificationDoc)
            .filter((notification) => (
              ACTIVE_NOTIFICATION_STATUSES.has(notification.status)
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

export const markCustomerNotificationRead = async (notificationId) => {
  const firebaseUser = await ensureFirebaseCustomer();
  const id = cleanString(notificationId);
  if (!id) return;

  await updateDoc(doc(getFirestoreDb(), 'customerNotifications', firebaseUser.uid, 'notifications', id), {
    status: 'read',
    readAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const hideCustomerNotification = async (notificationId) => {
  const firebaseUser = await ensureFirebaseCustomer();
  const id = cleanString(notificationId);
  if (!id) return;

  await updateDoc(doc(getFirestoreDb(), 'customerNotifications', firebaseUser.uid, 'notifications', id), {
    status: 'hidden',
    hiddenAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const markCustomerNotificationsRead = async (notificationIds) => {
  const firebaseUser = await ensureFirebaseCustomer();
  const ids = [...new Set((notificationIds || []).map(cleanString).filter(Boolean))];
  if (ids.length === 0) return;

  for (let start = 0; start < ids.length; start += MAX_BATCH_WRITES) {
    const batch = writeBatch(getFirestoreDb());
    ids.slice(start, start + MAX_BATCH_WRITES).forEach((id) => {
      batch.update(doc(getFirestoreDb(), 'customerNotifications', firebaseUser.uid, 'notifications', id), {
        status: 'read',
        readAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }
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

export const getCurrentAdminUidForNotifications = () => firebaseAuth.currentUser?.uid || null;
