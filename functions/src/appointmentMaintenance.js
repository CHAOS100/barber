import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { ACTIVE_APPOINTMENT_STATUSES, isAppointmentPastByEndTime } from './bookingPolicy.js';

export const scheduledAppointmentCompletion = onSchedule(
  { schedule: 'every 15 minutes', timeZone: 'Asia/Jerusalem' },
  async () => {
    const firestore = getFirestore();
    const snapshot = await firestore
      .collection('appointments')
      .where('status', 'in', [...ACTIVE_APPOINTMENT_STATUSES])
      .get();
    const now = new Date();
    const completed = snapshot.docs.filter((item) => (
      item.data()?.deletedFromAdmin !== true
      && isAppointmentPastByEndTime(item.data(), now)
    ));

    let updated = 0;
    for (let index = 0; index < completed.length; index += 400) {
      const batch = firestore.batch();
      const chunk = completed.slice(index, index + 400);
      chunk.forEach((item) => {
        batch.update(item.ref, {
          status: 'completed',
          statusBeforeAutomaticCompletion: item.data().status || null,
          completedAt: FieldValue.serverTimestamp(),
          completionSource: 'scheduled_server_validation',
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
      updated += chunk.length;
    }

    logger.info('scheduledAppointmentCompletion: done', {
      activeChecked: snapshot.size,
      updated,
    });
  },
);
