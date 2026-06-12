import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const EXPECTED_PROJECT_ID = 'ost-barber-app';
const BLOCKING_STATUSES = new Set(['pending', 'approved', 'confirmed']);

const services = [
  { id: 's1', name: 'תספורת רגילה', description: 'תספורת קלאסית עם גימור מושלם', price: 60, duration: 30, category: 'תספורת' },
  { id: 's2', name: 'תספורת + פנס', description: 'תספורת עם פנס מקצועי', price: 80, duration: 30, category: 'תספורת' },
  { id: 's3', name: 'תספורת + זקן', description: 'תספורת ועיצוב זקן', price: 80, duration: 40, category: 'תספורת' },
  { id: 's4', name: 'תספורת גזירות / מספריים', description: 'תספורת מקצועית עם מספריים', price: 100, duration: 45, category: 'תספורת' },
  { id: 's5', name: 'עיצוב זקן', description: 'עיצוב ותיקון זקן מקצועי', price: 40, duration: 15, category: 'זקן' },
  { id: 's6', name: 'חבילת פרימיום', description: 'תספורת, זקן וטיפול פנים', price: 150, duration: 80, category: 'חבילה' },
];

const fail = (message) => {
  console.error(`[booking:seed] ${message}`);
  process.exitCode = 1;
};

const seed = async () => {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    fail('GOOGLE_APPLICATION_CREDENTIALS must point to a local Firebase service-account JSON file.');
    return;
  }

  const serviceAccount = JSON.parse(await readFile(path.resolve(credentialsPath), 'utf8'));
  if (serviceAccount.project_id !== EXPECTED_PROJECT_ID) {
    fail(`Refusing project "${serviceAccount.project_id || 'unknown'}"; expected "${EXPECTED_PROJECT_ID}".`);
    return;
  }

  const app = getApps()[0] || initializeApp({
    credential: cert(serviceAccount),
    projectId: EXPECTED_PROJECT_ID,
  });
  const firestore = getFirestore(app);
  const servicesSnapshot = await firestore.collection('services').limit(1).get();
  const barbersSnapshot = await firestore.collection('barbers').limit(1).get();
  const batch = firestore.batch();

  if (servicesSnapshot.empty) {
    services.forEach((service, index) => {
      batch.set(firestore.doc(`services/${service.id}`), {
        ...service,
        active: true,
        sortOrder: index,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }

  if (barbersSnapshot.empty) {
    batch.set(firestore.doc('barbers/ost'), {
      name: 'OST',
      photoUrl: '',
      specialties: ['תספורת', 'פייד', 'זקן'],
      active: true,
      archived: false,
      sortOrder: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  batch.set(firestore.doc('settings/booking'), {
    appointmentBufferMinutes: 0,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await batch.commit();

  const appointments = await firestore.collection('appointments').get();
  const blocksBatch = firestore.batch();
  appointments.docs.forEach((snapshot) => {
    const appointment = snapshot.data();
    const block = firestore.doc(`appointmentBlocks/${snapshot.id}`);
    if (!BLOCKING_STATUSES.has(appointment.status) || !appointment.barberId) {
      blocksBatch.delete(block);
      return;
    }
    blocksBatch.set(block, {
      appointmentId: snapshot.id,
      barberId: appointment.barberId,
      date: appointment.date,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      status: appointment.status,
      updatedAt: appointment.updatedAt || appointment.createdAt || FieldValue.serverTimestamp(),
    });
  });
  await blocksBatch.commit();

  console.info('[booking:seed] Booking services, barber, settings, and availability blocks are ready.');
};

seed().catch((error) => fail(error?.message || String(error)));
