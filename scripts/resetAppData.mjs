/**
 * Safe data reset script for OST BARBER development/staging environment.
 *
 * Dry-run by default. Requires --confirm RESET_OST_BARBER to execute.
 * Preserves the admin user and the `admins` collection.
 *
 * Usage:
 *   node scripts/resetAppData.mjs                             # dry-run
 *   node scripts/resetAppData.mjs --confirm RESET_OST_BARBER # execute
 */

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const EXPECTED_PROJECT_ID = 'ost-barber-app';
const PRESERVED_ADMIN_UID = 'LKHxLRNsHEaNeFurgH4vwCkvQau1';
const CONFIRM_KEYWORD = 'RESET_OST_BARBER';

const COLLECTIONS_TO_DELETE = [
  'appointments',
  'notificationJobs',
  'customerNotifications',
  'waitingList',
  'reviews',
  'services',
  'barbers',
  'customers',
  'customerProfiles',
  'customerBookingLocks',
  'appointmentBlocks',
  'appointmentStats',
  'analytics',
  'reports',
  'gallery',
];

const STORAGE_PREFIXES_TO_DELETE = [
  'gallery/',
  'settings/hero/',
  'settings/profile/',
  'settings/hero-image.',
  'settings/profile-image.',
  'barbers/',
  'services/',
];

const BUSINESS_SETTINGS_IMAGE_FIELDS = [
  'homeHeroImageUrl',
  'homeHeroImagePath',
  'profileImageUrl',
  'profileImagePath',
];

const readArgument = (name) => {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
};

const log = (message) => console.log(`[reset] ${message}`);
const warn = (message) => console.warn(`[reset] ⚠ ${message}`);
const ok = (message) => console.log(`[reset] ✓ ${message}`);

const initAdmin = async () => {
  if (getApps().length > 0) return;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    || path.resolve(process.cwd(), 'service-account.json');
  const credJson = JSON.parse(await readFile(credPath, 'utf8'));
  if (credJson.project_id !== EXPECTED_PROJECT_ID) {
    throw new Error(`Wrong project: expected ${EXPECTED_PROJECT_ID}, got ${credJson.project_id}`);
  }
  initializeApp({ credential: cert(credJson), storageBucket: `${EXPECTED_PROJECT_ID}.appspot.com` });
  log(`Initialized Firebase Admin for project: ${EXPECTED_PROJECT_ID}`);
};

const deleteCollectionBatch = async (db, collectionPath, isDryRun) => {
  const snapshot = await db.collection(collectionPath).limit(500).get();
  if (snapshot.empty) {
    ok(`${collectionPath}: empty, nothing to delete`);
    return 0;
  }

  let count = snapshot.size;
  if (isDryRun) {
    warn(`DRY-RUN: would delete ${count} docs from ${collectionPath}`);
    return count;
  }

  const batch = db.batch();
  snapshot.docs.forEach((docSnapshot) => batch.delete(docSnapshot.ref));
  await batch.commit();

  if (count >= 500) {
    count += await deleteCollectionBatch(db, collectionPath, isDryRun);
  }
  return count;
};

const deleteUsersExceptAdmin = async (db, isDryRun) => {
  const snapshot = await db.collection('users').get();
  const toDelete = snapshot.docs.filter((docSnapshot) => docSnapshot.id !== PRESERVED_ADMIN_UID);
  if (toDelete.length === 0) {
    ok('users: no non-admin docs to delete');
    return 0;
  }
  if (isDryRun) {
    warn(`DRY-RUN: would delete ${toDelete.length} non-admin users (preserving ${PRESERVED_ADMIN_UID})`);
    return toDelete.length;
  }
  const batch = db.batch();
  toDelete.forEach((docSnapshot) => batch.delete(docSnapshot.ref));
  await batch.commit();
  ok(`users: deleted ${toDelete.length} non-admin users`);
  return toDelete.length;
};

const resetBusinessSettingsImages = async (db, isDryRun) => {
  const ref = db.doc('settings/business');
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    ok('settings/business: does not exist, skipping');
    return;
  }
  const data = snapshot.data();
  const fieldsPresent = BUSINESS_SETTINGS_IMAGE_FIELDS.filter((field) => data[field] != null);
  if (fieldsPresent.length === 0) {
    ok('settings/business: no image fields to reset');
    return;
  }
  if (isDryRun) {
    warn(`DRY-RUN: would reset image fields in settings/business: ${fieldsPresent.join(', ')}`);
    return;
  }
  const update = {};
  BUSINESS_SETTINGS_IMAGE_FIELDS.forEach((field) => { update[field] = FieldValue.delete(); });
  await ref.update(update);
  ok(`settings/business: reset fields ${fieldsPresent.join(', ')}`);
};

const deleteStoragePrefix = async (bucket, prefix, isDryRun) => {
  const [files] = await bucket.getFiles({ prefix });
  if (files.length === 0) {
    ok(`storage ${prefix}: empty, nothing to delete`);
    return 0;
  }
  if (isDryRun) {
    warn(`DRY-RUN: would delete ${files.length} files under storage/${prefix}`);
    return files.length;
  }
  await Promise.all(files.map((file) => file.delete()));
  ok(`storage ${prefix}: deleted ${files.length} files`);
  return files.length;
};

const main = async () => {
  const confirmValue = readArgument('--confirm');
  const isDryRun = confirmValue !== CONFIRM_KEYWORD;

  if (isDryRun) {
    log('=== DRY-RUN MODE (no data will be deleted) ===');
    log(`To execute: node scripts/resetAppData.mjs --confirm ${CONFIRM_KEYWORD}`);
  } else {
    log('=== EXECUTE MODE — DELETING DATA ===');
  }

  await initAdmin();

  const db = getFirestore();
  const bucket = getStorage().bucket();

  log('--- Firestore collections ---');
  for (const col of COLLECTIONS_TO_DELETE) {
    const count = await deleteCollectionBatch(db, col, isDryRun);
    if (!isDryRun && count > 0) ok(`${col}: deleted ${count} docs`);
  }

  log('--- users collection (preserve admin) ---');
  await deleteUsersExceptAdmin(db, isDryRun);

  log('--- business settings image fields ---');
  await resetBusinessSettingsImages(db, isDryRun);

  log('--- Firebase Storage ---');
  for (const prefix of STORAGE_PREFIXES_TO_DELETE) {
    await deleteStoragePrefix(bucket, prefix, isDryRun);
  }

  log(isDryRun ? '=== Dry-run complete. No data was changed. ===' : '=== Reset complete. ===');
};

main().catch((error) => {
  console.error('[reset] Fatal error:', error.message);
  process.exitCode = 1;
});
