import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'ost-barber-app';
let testEnvironment;

const appointmentData = (customerId, overrides = {}) => ({
  customerId,
  customerName: 'Test Customer',
  customerPhone: '0500000000',
  serviceName: 'Haircut',
  serviceId: 'service-haircut',
  barberId: null,
  date: '2026-06-20',
  startTime: '10:00',
  endTime: '10:30',
  status: 'pending',
  createdAt: serverTimestamp(),
  ...overrides,
});

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: await readFile('firestore.rules', 'utf8'),
    },
  });

  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, 'admins', 'active-admin'), {
      role: 'admin',
      active: true,
      name: 'Active Admin',
      email: 'active@example.com',
      createdAt: new Date(),
    });
    await setDoc(doc(firestore, 'admins', 'inactive-admin'), {
      role: 'admin',
      active: false,
      name: 'Inactive Admin',
      email: 'inactive@example.com',
      createdAt: new Date(),
    });
    await setDoc(doc(firestore, 'admins', 'invalid-role-admin'), {
      role: 'staff',
      active: true,
      name: 'Invalid Role',
      email: 'staff@example.com',
      createdAt: new Date(),
    });
    await setDoc(doc(firestore, 'appointments', 'customer-a-existing'), {
      ...appointmentData('customer-a'),
      createdAt: new Date(),
    });
  });
});

after(async () => {
  await testEnvironment?.cleanup();
});

test('active admin can read every appointment', async () => {
  const firestore = testEnvironment.authenticatedContext('active-admin').firestore();
  const snapshot = await assertSucceeds(getDocs(collection(firestore, 'appointments')));
  assert.equal(snapshot.size, 1);
});

test('inactive and invalid-role admins cannot read appointments', async () => {
  const inactiveDb = testEnvironment.authenticatedContext('inactive-admin').firestore();
  const invalidRoleDb = testEnvironment.authenticatedContext('invalid-role-admin').firestore();

  await assertFails(getDocs(collection(inactiveDb, 'appointments')));
  await assertFails(getDocs(collection(invalidRoleDb, 'appointments')));
});

test('customer can create a pending appointment for their own uid and read it', async () => {
  const firestore = testEnvironment.authenticatedContext('customer-a').firestore();
  const appointmentRef = doc(firestore, 'appointments', 'customer-a-created');

  await assertSucceeds(setDoc(appointmentRef, appointmentData('customer-a')));
  const snapshot = await assertSucceeds(getDoc(appointmentRef));
  assert.equal(snapshot.data().status, 'pending');
});

test('customer cannot read another customer appointment', async () => {
  const firestore = testEnvironment.authenticatedContext('customer-b').firestore();
  await assertFails(getDoc(doc(firestore, 'appointments', 'customer-a-existing')));
});

test('active admin can approve and reject an appointment', async () => {
  const firestore = testEnvironment.authenticatedContext('active-admin').firestore();
  const appointmentRef = doc(firestore, 'appointments', 'customer-a-existing');

  await assertSucceeds(updateDoc(appointmentRef, {
    status: 'confirmed',
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(appointmentRef, {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  }));
});
