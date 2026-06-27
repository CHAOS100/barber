import { collection, limit as limitQuery, onSnapshot, orderBy, query } from 'firebase/firestore';
import {
  ensureFirebaseAdmin,
  firebaseProjectId,
  getFirestoreDb,
} from '@/lib/firebase';

const notificationJobsCollection = () => collection(getFirestoreDb(), 'notificationJobs');

const byNewestFirst = (left, right) => {
  const leftTime = left.createdAt?.toMillis?.() || 0;
  const rightTime = right.createdAt?.toMillis?.() || 0;
  return rightTime - leftTime;
};

export const subscribeToAdminNotificationJobs = (onData, onError) => {
  let unsubscribe = () => {};
  let cancelled = false;

  ensureFirebaseAdmin()
    .then(() => {
      if (cancelled) return;
      console.info('[Firestore] Admin notification jobs listener subscribing', {
        projectId: firebaseProjectId,
      });
      unsubscribe = onSnapshot(
        query(notificationJobsCollection(), orderBy('createdAt', 'desc'), limitQuery(50)),
        (snapshot) => {
          const jobs = snapshot.docs
            .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }))
            .sort(byNewestFirst);
          console.info('[Firestore] Admin notification jobs snapshot received', {
            projectId: firebaseProjectId,
            size: snapshot.size,
          });
          onData(jobs);
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
