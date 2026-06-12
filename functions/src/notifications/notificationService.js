const isAlreadyExistsError = (error) =>
  error?.code === 6 || error?.code === 'already-exists';

export class NotificationJobService {
  constructor(firestore) {
    this.firestore = firestore;
  }

  async enqueue(jobs) {
    for (const notificationJob of jobs) {
      const reference = this.firestore.collection('notificationJobs').doc(notificationJob.id);
      try {
        await reference.create(notificationJob.data);
      } catch (error) {
        if (!isAlreadyExistsError(error)) throw error;
      }
    }
  }
}
