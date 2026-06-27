const isAlreadyExistsError = (error) =>
  error?.code === 6 || error?.code === 'already-exists';

const pushDebug = (message, details = {}) => {
  console.log('[PUSH_DEBUG]', message, details);
};

export class NotificationJobService {
  constructor(firestore) {
    this.firestore = firestore;
  }

  async enqueue(jobs) {
    for (const notificationJob of jobs) {
      const reference = this.firestore.collection('notificationJobs').doc(notificationJob.id);
      pushDebug('enqueue called', {
        jobId: notificationJob.id,
        type: notificationJob.data?.type || null,
        customerId: notificationJob.data?.customerId || null,
        targetUserId: notificationJob.data?.targetUserId || null,
        channel: notificationJob.data?.channel || null,
        scheduledFor: notificationJob.data?.scheduledFor || null,
      });
      try {
        await reference.create(notificationJob.data);
        pushDebug('notification job created', {
          jobId: notificationJob.id,
          type: notificationJob.data?.type || null,
          customerId: notificationJob.data?.customerId || null,
          channel: notificationJob.data?.channel || null,
        });
      } catch (error) {
        if (isAlreadyExistsError(error)) {
          pushDebug('notification job already exists, skipping duplicate create', {
            jobId: notificationJob.id,
            type: notificationJob.data?.type || null,
            channel: notificationJob.data?.channel || null,
          });
          continue;
        }
        console.warn('[PUSH_DEBUG]', 'notification job enqueue failed', {
          jobId: notificationJob.id,
          type: notificationJob.data?.type || null,
          channel: notificationJob.data?.channel || null,
          errorCode: error?.code || 'unknown',
          errorMessage: error?.message || String(error),
        });
        throw error;
      }
    }
  }
}
