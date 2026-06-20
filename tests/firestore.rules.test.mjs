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
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
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

const customerData = (uid, phoneNumber, overrides = {}) => ({
  uid,
  phoneNumber,
  firstName: 'Test',
  lastName: 'Customer',
  role: 'customer',
  visitsCount: 0,
  completedAppointments: 0,
  cancelledAppointments: 0,
  noShowCount: 0,
  totalSpent: 0,
  reviewsCount: 0,
  blocked: false,
  blockedReason: '',
  blockedAt: null,
  blockedBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastLoginAt: new Date(),
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
    await setDoc(doc(firestore, 'users', 'customer-a'), customerData('customer-a', '+972500000000'));
    await setDoc(doc(firestore, 'users', 'customer-b'), customerData('customer-b', '+972511111111', {
      firstName: 'Other',
    }));
    await setDoc(doc(firestore, 'reviews', 'published-review'), {
      customerId: 'customer-a',
      customerName: 'Test Customer',
      appointmentId: 'customer-a-existing',
      rating: 5,
      text: 'Great',
      status: 'published',
      createdAt: new Date(),
    });
    await setDoc(doc(firestore, 'reviews', 'hidden-review'), {
      customerId: 'customer-a',
      customerName: 'Test Customer',
      appointmentId: 'hidden-appointment',
      rating: 4,
      text: 'Hidden',
      status: 'hidden',
      createdAt: new Date(),
    });
    await setDoc(doc(firestore, 'gallery', 'published-photo'), {
      imageUrl: 'https://example.com/photo.jpg',
      category: 'gallery',
      active: true,
    });
    await setDoc(doc(firestore, 'gallery', 'hidden-photo'), {
      imageUrl: 'https://example.com/hidden.jpg',
      category: 'gallery',
      active: false,
    });
    await setDoc(doc(firestore, 'waitingList', 'customer-a-wait'), {
      customerId: 'customer-a',
      customerName: 'Test Customer',
      phoneNumber: '+972500000000',
      date: '2026-06-20',
      preferenceType: 'whole_day',
      serviceId: 'active-service',
      serviceName: 'Haircut',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      notifiedAt: null,
      expiresAt: null,
    });
    await setDoc(doc(firestore, 'waitingList', 'customer-b-wait'), {
      customerId: 'customer-b',
      customerName: 'Other Customer',
      phoneNumber: '+972511111111',
      date: '2026-06-20',
      preferenceType: 'exact_time',
      exactTime: '10:00',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      notifiedAt: null,
      expiresAt: null,
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

test('active admin can create, update, and delete services', async () => {
  const firestore = testEnvironment.authenticatedContext('active-admin').firestore();
  const serviceRef = doc(firestore, 'services', 'admin-created-service');

  await assertSucceeds(setDoc(serviceRef, {
    name: 'Admin Haircut',
    description: '',
    category: 'haircut',
    price: 80,
    duration: 30,
    active: true,
    sortOrder: 10,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(serviceRef, { duration: 40, updatedAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(serviceRef));
});

test('active admin can save booking settings and public users can read them', async () => {
  const adminDb = testEnvironment.authenticatedContext('active-admin').firestore();
  const settingsRef = doc(adminDb, 'settings', 'booking');
  await assertSucceeds(setDoc(settingsRef, {
    appointmentBufferMinutes: 10,
    slotInterval: 10,
    workingHours: [],
    updatedAt: serverTimestamp(),
  }));

  const publicDb = testEnvironment.unauthenticatedContext().firestore();
  const snapshot = await assertSucceeds(getDoc(doc(publicDb, 'settings', 'booking')));
  assert.equal(snapshot.data().appointmentBufferMinutes, 10);
});

test('active admin can save public business settings', async () => {
  const adminDb = testEnvironment.authenticatedContext('active-admin').firestore();
  const settingsRef = doc(adminDb, 'settings', 'business');
  await assertSucceeds(setDoc(settingsRef, {
    name: 'OST Barber',
    phone: '0500000000',
    address: 'Israel',
    description: '',
    updatedAt: serverTimestamp(),
  }));

  const publicDb = testEnvironment.unauthenticatedContext().firestore();
  const snapshot = await assertSucceeds(getDoc(doc(publicDb, 'settings', 'business')));
  assert.equal(snapshot.data().name, 'OST Barber');
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

test('phone customer can create, read, and cancel only their own waiting list entries', async () => {
  const firestore = testEnvironment.authenticatedContext('customer-a', phoneCustomerToken).firestore();

  await assertSucceeds(setDoc(doc(firestore, 'waitingList', 'customer-a-created-wait'), {
    customerId: 'customer-a',
    customerName: 'Test Customer',
    phoneNumber: '+972500000000',
    date: '2026-06-21',
    preferenceType: 'time_range',
    startTime: '09:00',
    endTime: '12:00',
    serviceId: 'active-service',
    serviceName: 'Haircut',
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    notifiedAt: null,
    expiresAt: null,
  }));
  await assertSucceeds(getDoc(doc(firestore, 'waitingList', 'customer-a-wait')));
  await assertFails(getDoc(doc(firestore, 'waitingList', 'customer-b-wait')));
  await assertFails(setDoc(doc(firestore, 'waitingList', 'customer-a-for-other'), {
    customerId: 'customer-b',
    customerName: 'Wrong Customer',
    phoneNumber: '+972500000000',
    date: '2026-06-21',
    preferenceType: 'whole_day',
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(doc(firestore, 'waitingList', 'customer-a-created-wait'), {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(firestore, 'waitingList', 'customer-a-created-wait'), {
    status: 'notified',
    updatedAt: serverTimestamp(),
  }));
});

test('active admin can read, update, and delete waiting list entries', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'waitingList', 'admin-managed-wait'), {
      customerId: 'customer-a',
      customerName: 'Test Customer',
      phoneNumber: '+972500000000',
      date: '2026-06-22',
      preferenceType: 'day_part',
      dayPart: 'morning',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  const firestore = testEnvironment.authenticatedContext('active-admin').firestore();
  await assertSucceeds(getDocs(collection(firestore, 'waitingList')));
  await assertSucceeds(updateDoc(doc(firestore, 'waitingList', 'admin-managed-wait'), {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(deleteDoc(doc(firestore, 'waitingList', 'admin-managed-wait')));
});

test('phone customer can read only users/{auth.uid}', async () => {
  const firestore = testEnvironment.authenticatedContext('customer-a', phoneCustomerToken).firestore();
  const snapshot = await assertSucceeds(getDoc(doc(firestore, 'users', 'customer-a')));
  assert.equal(snapshot.data().phoneNumber, '+972500000000');
  await assertFails(getDoc(doc(firestore, 'users', 'customer-b')));
});

test('phone customer can create only their own correctly bound user document', async () => {
  const newCustomerToken = {
    firebase: { sign_in_provider: 'phone' },
    phone_number: '+972522222222',
  };
  const firestore = testEnvironment.authenticatedContext('new-customer', newCustomerToken).firestore();

  await assertSucceeds(setDoc(doc(firestore, 'users', 'new-customer'), {
    uid: 'new-customer',
    phoneNumber: '+972522222222',
    firstName: 'New',
    lastName: 'Customer',
    role: 'customer',
    visitsCount: 0,
    completedAppointments: 0,
    cancelledAppointments: 0,
    noShowCount: 0,
    totalSpent: 0,
    reviewsCount: 0,
    blocked: false,
    blockedReason: '',
    blockedAt: null,
    blockedBy: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(firestore, 'users', 'different-uid'), {
    uid: 'different-uid',
    phoneNumber: '+972522222222',
    firstName: 'Wrong',
    lastName: 'Document',
    role: 'customer',
    visitsCount: 0,
    completedAppointments: 0,
    cancelledAppointments: 0,
    noShowCount: 0,
    totalSpent: 0,
    reviewsCount: 0,
    blocked: false,
    blockedReason: '',
    blockedAt: null,
    blockedBy: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  }));
});

test('customer can update preferences but cannot update name, phoneNumber, or role', async () => {
  const firestore = testEnvironment.authenticatedContext('customer-a', phoneCustomerToken).firestore();

  await assertSucceeds(updateDoc(doc(firestore, 'users', 'customer-a'), {
    language: 'he',
    notificationPreferences: { reminder24h: true },
    updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(firestore, 'users', 'customer-b'), {
    language: 'he',
    updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(firestore, 'users', 'customer-a'), {
    firstName: 'Changed',
    updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(firestore, 'users', 'customer-a'), {
    phoneNumber: '+972533333333',
    updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(firestore, 'users', 'customer-a'), {
    role: 'admin',
    updatedAt: serverTimestamp(),
  }));
});

test('active admin can read users and edit names but cannot change phoneNumber or role', async () => {
  const firestore = testEnvironment.authenticatedContext('active-admin').firestore();
  const snapshot = await assertSucceeds(getDocs(collection(firestore, 'users')));
  assert.ok(snapshot.size >= 2);
  await assertSucceeds(updateDoc(doc(firestore, 'users', 'customer-a'), {
    firstName: 'Admin',
    lastName: 'Changed',
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(doc(firestore, 'users', 'customer-a'), {
    blocked: true,
    blockedReason: 'Policy violation',
    blockedAt: serverTimestamp(),
    blockedBy: 'active-admin',
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(doc(firestore, 'users', 'customer-a'), {
    blocked: false,
    blockedReason: '',
    blockedAt: null,
    blockedBy: null,
    blockClearedAt: serverTimestamp(),
    blockClearedBy: 'active-admin',
    blockClearedReason: 'Resolved',
    requiresNoShowPayment: false,
    noShowPaymentAmount: 0,
    noShowPaymentReason: '',
    relatedAppointmentId: '',
    paymentClearedAt: serverTimestamp(),
    paymentClearedBy: 'active-admin',
    paymentClearedReason: 'Paid in shop',
    warningCount: 0,
    lastWarningReason: '',
    warningClearedAt: serverTimestamp(),
    warningClearedBy: 'active-admin',
    warningClearedReason: 'Warning resolved',
    updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(firestore, 'users', 'customer-a'), {
    phoneNumber: '+972544444444',
    updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(firestore, 'users', 'customer-a'), {
    role: 'admin',
    updatedAt: serverTimestamp(),
  }));
});

test('published reviews are public, hidden reviews are private, and clients cannot write reviews', async () => {
  const publicDb = testEnvironment.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(publicDb, 'reviews', 'published-review')));
  await assertFails(getDoc(doc(publicDb, 'reviews', 'hidden-review')));
  const published = await assertSucceeds(getDocs(query(
    collection(publicDb, 'reviews'),
    where('status', '==', 'published'),
  )));
  assert.equal(published.size, 1);

  const customerDb = testEnvironment.authenticatedContext('customer-a', phoneCustomerToken).firestore();
  await assertSucceeds(getDoc(doc(customerDb, 'reviews', 'hidden-review')));
  await assertFails(setDoc(doc(customerDb, 'reviews', 'client-review'), {
    customerId: 'customer-a',
    appointmentId: 'customer-a-existing',
    rating: 5,
    text: 'Client write',
    status: 'published',
  }));
});

test('admin can read all reviews but review writes require trusted functions', async () => {
  const adminDb = testEnvironment.authenticatedContext('active-admin').firestore();
  const snapshot = await assertSucceeds(getDocs(collection(adminDb, 'reviews')));
  assert.equal(snapshot.size, 2);
  await assertFails(deleteDoc(doc(adminDb, 'reviews', 'published-review')));
});

test('gallery exposes only published photos and admin can manage it', async () => {
  const publicDb = testEnvironment.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(publicDb, 'gallery', 'published-photo')));
  await assertFails(getDoc(doc(publicDb, 'gallery', 'hidden-photo')));
  const published = await assertSucceeds(getDocs(query(
    collection(publicDb, 'gallery'),
    where('active', '==', true),
  )));
  assert.equal(published.size, 1);

  const adminDb = testEnvironment.authenticatedContext('active-admin').firestore();
  await assertSucceeds(updateDoc(doc(adminDb, 'gallery', 'hidden-photo'), {
    active: true,
  }));
});
