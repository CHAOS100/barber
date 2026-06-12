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
const phoneCustomerToken = {
  firebase: { sign_in_provider: 'phone' },
  phone_number: '+972500000000',
};

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
    await setDoc(doc(firestore, 'notificationJobs', 'backend-created-job'), {
      type: 'appointment_approved',
      channel: 'whatsapp',
      phone: '+972500000000',
      appointmentId: 'customer-a-existing',
      scheduledFor: new Date(),
      status: 'pending',
      createdAt: new Date(),
      sentAt: null,
      error: null,
    });
    await setDoc(doc(firestore, 'appointmentBlocks', 'customer-a-existing'), {
      appointmentId: 'customer-a-existing',
      barberId: 'barber-1',
      date: '2026-06-20',
      startTime: '10:00',
      endTime: '10:30',
      status: 'confirmed',
    });
    await setDoc(doc(firestore, 'barbers', 'active-barber'), {
      name: 'Active Barber',
      active: true,
      archived: false,
    });
    await setDoc(doc(firestore, 'barbers', 'inactive-barber'), {
      name: 'Inactive Barber',
      active: false,
      archived: false,
    });
    await setDoc(doc(firestore, 'services', 'active-service'), {
      name: 'Haircut',
      active: true,
      duration: 30,
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

test('customer reads their own appointment but direct writes are blocked', async () => {
  const firestore = testEnvironment.authenticatedContext('customer-a', phoneCustomerToken).firestore();
  const appointmentRef = doc(firestore, 'appointments', 'customer-a-created');

  await assertFails(setDoc(appointmentRef, appointmentData('customer-a')));
  const snapshot = await assertSucceeds(getDoc(doc(firestore, 'appointments', 'customer-a-existing')));
  assert.equal(snapshot.data().status, 'pending');
});

test('customer cannot read another customer appointment', async () => {
  const firestore = testEnvironment.authenticatedContext('customer-b', phoneCustomerToken).firestore();
  await assertFails(getDoc(doc(firestore, 'appointments', 'customer-a-existing')));
});

test('appointment mutations are restricted to trusted backend functions', async () => {
  const firestore = testEnvironment.authenticatedContext('active-admin').firestore();
  const appointmentRef = doc(firestore, 'appointments', 'customer-a-existing');

  await assertFails(updateDoc(appointmentRef, {
    status: 'confirmed',
    updatedAt: serverTimestamp(),
  }));
});

test('availability blocks are public but inactive barbers are hidden from customers', async () => {
  const firestore = testEnvironment.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(firestore, 'appointmentBlocks', 'customer-a-existing')));
  await assertSucceeds(getDoc(doc(firestore, 'barbers', 'active-barber')));
  await assertFails(getDoc(doc(firestore, 'barbers', 'inactive-barber')));
});

test('customers cannot create or read notification jobs', async () => {
  const firestore = testEnvironment.authenticatedContext('customer-a', phoneCustomerToken).firestore();
  const notificationJobRef = doc(firestore, 'notificationJobs', 'customer-created-job');

  await assertFails(setDoc(notificationJobRef, {
    type: 'appointment_approved',
    channel: 'whatsapp',
    phone: '+972500000000',
    appointmentId: 'customer-a-existing',
    scheduledFor: serverTimestamp(),
    status: 'pending',
    createdAt: serverTimestamp(),
    sentAt: null,
    error: null,
  }));
  await assertFails(getDoc(doc(firestore, 'notificationJobs', 'backend-created-job')));
});

test('anonymous users cannot create customer appointments', async () => {
  const firestore = testEnvironment.authenticatedContext('anonymous-user', {
    firebase: { sign_in_provider: 'anonymous' },
  }).firestore();

  await assertFails(setDoc(
    doc(firestore, 'appointments', 'anonymous-created'),
    appointmentData('anonymous-user'),
  ));
});

test('active admins can read notification jobs but cannot create them from the client', async () => {
  const firestore = testEnvironment.authenticatedContext('active-admin').firestore();

  await assertSucceeds(getDoc(doc(firestore, 'notificationJobs', 'backend-created-job')));
  await assertFails(setDoc(doc(firestore, 'notificationJobs', 'admin-client-created-job'), {
    type: 'appointment_approved',
    channel: 'whatsapp',
    phone: '+972500000000',
    appointmentId: 'customer-a-existing',
    scheduledFor: serverTimestamp(),
    status: 'pending',
    createdAt: serverTimestamp(),
    sentAt: null,
    error: null,
  }));
});
