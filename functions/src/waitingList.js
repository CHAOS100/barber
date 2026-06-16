import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { buildWaitingListManualSmsJob } from './notifications/notificationJobs.js';
import { NotificationJobService } from './notifications/notificationService.js';
import { sendSmsNotificationJob } from './notifications/smsProvider.js';

const ALLOWED_ORIGINS = new Set([
  'https://barber-sigma-five.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]);

const db = () => getFirestore();
const notificationJobs = () => new NotificationJobService(getFirestore());
const text = (value) => String(value || '').trim();

const isValidIsraeliPhone = (phone) => {
  const value = text(phone).replace(/[^\d+]/g, '');
  return /^05\d{8}$/.test(value)
    || /^9725\d{8}$/.test(value)
    || /^\+9725\d{8}$/.test(value);
};

const setCorsHeaders = (request, response) => {
  const origin = request.get('origin') || '';
  if (ALLOWED_ORIGINS.has(origin)) {
    response.set('Access-Control-Allow-Origin', origin);
    response.set('Vary', 'Origin');
  }
  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const sendJson = (response, status, payload) => {
  response.status(status).json(payload);
};

const cleanError = (code, message, status = 400) => ({ code, message, status });

const readBearerToken = (request) => {
  const authorization = request.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
};

const requireAdminFromBearerToken = async (request) => {
  const token = readBearerToken(request);
  if (!token) {
    throw cleanError('unauthenticated', 'Authentication is required.', 401);
  }

  let decodedToken;
  try {
    decodedToken = await getAuth().verifyIdToken(token);
  } catch (error) {
    logger.warn('manualNotifyWaitingListEntry token verification failed', {
      code: error?.code || 'unknown',
    });
    throw cleanError('unauthenticated', 'Authentication is required.', 401);
  }

  const adminSnapshot = await db().doc(`admins/${decodedToken.uid}`).get();
  const admin = adminSnapshot.data();
  if (!adminSnapshot.exists || admin?.role !== 'admin' || admin?.active !== true) {
    throw cleanError('permission-denied', 'Active admin access is required.', 403);
  }

  return { uid: decodedToken.uid };
};

const handleManualNotify = async (request) => {
  const auth = await requireAdminFromBearerToken(request);
  const waitingListId = text(request.body?.waitingListId);
  if (!waitingListId) {
    throw cleanError('invalid-argument', 'waitingListId is required.', 400);
  }

  const reference = db().doc(`waitingList/${waitingListId}`);
  const snapshot = await reference.get();
  if (!snapshot.exists) {
    throw cleanError('not-found', 'Waiting list entry not found.', 404);
  }

  const entry = { id: snapshot.id, ...snapshot.data() };
  if (!entry.phoneNumber) {
    throw cleanError('failed-precondition', 'Waiting list entry has no customer phone.', 400);
  }
  if (!isValidIsraeliPhone(entry.phoneNumber)) {
    throw cleanError('failed-precondition', 'Waiting list entry has invalid customer phone.', 400);
  }

  const notificationJob = buildWaitingListManualSmsJob(waitingListId, entry);
  const smsResult = await sendSmsNotificationJob(notificationJob.data);
  const notificationJobForStorage = {
    ...notificationJob,
    data: {
      ...notificationJob.data,
      provider: smsResult.provider || null,
      providerConfigured: smsResult.providerConfigured === true,
      providerMessageId: smsResult.providerMessageId || null,
      status: smsResult.sent ? 'sent' : 'pending',
      sentAt: smsResult.sent ? FieldValue.serverTimestamp() : null,
      error: smsResult.sent ? null : (smsResult.reason || smsResult.error || null),
    },
  };

  await notificationJobs().enqueue([notificationJobForStorage]);

  if (smsResult.providerConfigured === true && smsResult.sent !== true) {
    await reference.update({
      lastNotificationError: 'sms-send-failed',
      smsProviderConfigured: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw cleanError('sms/send-failed', 'SMS provider failed to send the message.', 502);
  }

  await reference.update({
    status: 'notified',
    notifiedAt: FieldValue.serverTimestamp(),
    manuallyNotifiedAt: FieldValue.serverTimestamp(),
    manuallyNotifiedBy: auth.uid,
    smsProviderConfigured: smsResult.providerConfigured === true,
    smsSent: smsResult.sent === true,
    smsProvider: smsResult.provider || null,
    smsProviderMessageId: smsResult.providerMessageId || null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const providerConfigured = smsResult.providerConfigured === true;
  return {
    ok: true,
    id: waitingListId,
    status: smsResult.sent ? 'sent' : 'queued',
    notificationJobCreated: true,
    smsProviderConfigured: providerConfigured,
    smsSent: smsResult.sent === true,
    provider: smsResult.provider || null,
    message: providerConfigured
      ? 'Notification job created and SMS sent.'
      : 'Notification job created, but real SMS provider is not configured yet.',
  };
};

export const manualNotifyWaitingListEntry = onRequest(async (request, response) => {
  setCorsHeaders(request, response);

  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return;
  }

  const origin = request.get('origin') || '';
  if (!ALLOWED_ORIGINS.has(origin)) {
    sendJson(response, 403, {
      ok: false,
      error: {
        code: 'cors/origin-not-allowed',
        message: 'Origin is not allowed.',
      },
    });
    return;
  }

  if (request.method !== 'POST') {
    sendJson(response, 405, {
      ok: false,
      error: {
        code: 'method-not-allowed',
        message: 'Only POST is allowed.',
      },
    });
    return;
  }

  try {
    const result = await handleManualNotify(request);
    sendJson(response, 200, result);
  } catch (error) {
    const status = Number(error?.status || 500);
    const code = error?.code || 'internal';
    const message = status >= 500
      ? 'Temporary server error.'
      : error?.message || 'Request failed.';

    logger.error('manualNotifyWaitingListEntry failed', {
      code,
      status,
      message: error?.message || 'Unknown error',
    });

    sendJson(response, status, {
      ok: false,
      error: { code, message },
    });
  }
});
