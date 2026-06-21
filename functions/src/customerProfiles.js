import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { requirePhoneCustomerAuth } from './auth.js';

const db = () => getFirestore();

const requiredName = (value, field) => {
  const name = String(value || '').trim();
  if (!name) throw new HttpsError('invalid-argument', `${field} is required.`);
  if (name.length > 80) throw new HttpsError('invalid-argument', `${field} is too long.`);
  return name;
};

const publicProfile = (snapshot) => {
  const data = snapshot.data();
  return {
    uid: snapshot.id,
    phoneNumber: data.phoneNumber,
    firstName: data.firstName,
    lastName: data.lastName,
    role: data.role,
    visitsCount: Number(data.visitsCount || 0),
    completedAppointments: Number(data.completedAppointments || 0),
    cancelledAppointments: Number(data.cancelledAppointments || 0),
    noShowCount: Number(data.noShowCount || 0),
    totalSpent: Number(data.totalSpent || 0),
    reviewsCount: Number(data.reviewsCount || 0),
    blocked: data.blocked === true,
    blockedReason: data.blockedReason || '',
    warningCount: Number(data.warningCount || 0),
    requiresNoShowPayment: data.requiresNoShowPayment === true,
    noShowPaymentAmount: Number(data.noShowPaymentAmount || 0),
    noShowPaymentReason: data.noShowPaymentReason || '',
    relatedAppointmentId: data.relatedAppointmentId || '',
    notificationPreferences: data.notificationPreferences || {},
    language: data.language || 'he',
  };
};

const getProfilesByPhone = (transaction, phoneNumber) =>
  transaction.get(db().collection('users').where('phoneNumber', '==', phoneNumber).limit(2));

const profileDisplayName = (profile) =>
  String(profile?.name || `${profile?.firstName || ''} ${profile?.lastName || ''}`).trim();

const attachPhoneAppointmentsToCustomer = async (transaction, uid, phoneNumber, profile) => {
  const appointments = await transaction.get(
    db().collection('appointments').where('customerPhone', '==', phoneNumber),
  );
  const displayName = profileDisplayName(profile);

  appointments.docs.forEach((appointmentSnapshot) => {
    const appointment = appointmentSnapshot.data();
    const linkedPreviousCustomerId = appointment.customerId && appointment.customerId !== uid
      ? appointment.customerId
      : null;
    transaction.update(appointmentSnapshot.ref, {
      customerId: uid,
      customerName: appointment.customerName || displayName,
      customerRegistered: true,
      ...(linkedPreviousCustomerId ? { linkedPreviousCustomerId } : {}),
      linkedCustomerAt: FieldValue.serverTimestamp(),
      linkedCustomerBy: 'phone_login',
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
};

export const completeCustomerLogin = onCall(async (request) => {
  const auth = await requirePhoneCustomerAuth(request);

  const result = await db().runTransaction(async (transaction) => {
    const matches = await getProfilesByPhone(transaction, auth.phoneNumber);
    if (matches.empty) return { registrationRequired: true, profile: null };
    if (matches.size > 1) {
      throw new HttpsError('failed-precondition', 'Duplicate customer profiles exist for this phone number.');
    }

    const profileSnapshot = matches.docs[0];
    if (
      profileSnapshot.id !== auth.uid
      || profileSnapshot.data().uid !== auth.uid
      || profileSnapshot.data().role !== 'customer'
    ) {
      throw new HttpsError('failed-precondition', 'Customer profile UID does not match Firebase Auth UID.');
    }

    const profile = publicProfile(profileSnapshot);
    await attachPhoneAppointmentsToCustomer(transaction, auth.uid, auth.phoneNumber, profile);
    transaction.update(profileSnapshot.ref, { lastLoginAt: FieldValue.serverTimestamp() });
    return { registrationRequired: false, profile };
  });

  logger.info(result.registrationRequired ? 'New user registration required' : 'Existing user login complete', {
    uid: auth.uid,
  });
  return result;
});

export const registerCustomerProfile = onCall(async (request) => {
  const auth = await requirePhoneCustomerAuth(request);
  const firstName = requiredName(request.data?.firstName, 'firstName');
  const lastName = requiredName(request.data?.lastName, 'lastName');

  const profile = await db().runTransaction(async (transaction) => {
    const matches = await getProfilesByPhone(transaction, auth.phoneNumber);
    if (!matches.empty) {
      const existing = matches.docs[0];
      if (
        matches.size > 1
        || existing.id !== auth.uid
        || existing.data().uid !== auth.uid
        || existing.data().role !== 'customer'
      ) {
        throw new HttpsError('already-exists', 'A customer profile already exists for this phone number.');
      }

      transaction.update(existing.ref, { lastLoginAt: FieldValue.serverTimestamp() });
      return publicProfile(existing);
    }

    const ref = db().doc(`users/${auth.uid}`);
    const existingByUid = await transaction.get(ref);
    if (existingByUid.exists) {
      throw new HttpsError('already-exists', 'A customer profile already exists for this Firebase Auth UID.');
    }

    const createdProfile = {
      uid: auth.uid,
      phoneNumber: auth.phoneNumber,
      firstName,
      lastName,
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
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastLoginAt: FieldValue.serverTimestamp(),
    };
    await attachPhoneAppointmentsToCustomer(transaction, auth.uid, auth.phoneNumber, createdProfile);
    transaction.set(ref, createdProfile);
    return publicProfile({ id: auth.uid, data: () => createdProfile });
  });

  logger.info('Customer profile created', { uid: auth.uid });
  return { profile };
});
