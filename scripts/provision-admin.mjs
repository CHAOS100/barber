import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const EXPECTED_PROJECT_ID = 'ost-barber-app';

const readArgument = (name) => {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();

  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
};

const fail = (message) => {
  console.error(`[admin:provision] ${message}`);
  process.exitCode = 1;
};

const provisionAdmin = async () => {
  const email = readArgument('--email').toLowerCase();
  const name = readArgument('--name');
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!email || !name) {
    fail('Usage: npm run admin:provision -- --email admin@example.com --name "Admin Name"');
    return;
  }

  if (!credentialsPath) {
    fail('GOOGLE_APPLICATION_CREDENTIALS must point to a local Firebase service-account JSON file.');
    return;
  }

  const resolvedCredentialsPath = path.resolve(credentialsPath);
  const serviceAccount = JSON.parse(await readFile(resolvedCredentialsPath, 'utf8'));

  if (serviceAccount.project_id !== EXPECTED_PROJECT_ID) {
    fail(
      `Refusing to provision project "${serviceAccount.project_id || 'unknown'}"; expected "${EXPECTED_PROJECT_ID}".`,
    );
    return;
  }

  const app = getApps()[0] || initializeApp({
    credential: cert(serviceAccount),
    projectId: EXPECTED_PROJECT_ID,
  });
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const user = await auth.getUserByEmail(email);
  const adminRef = firestore.collection('admins').doc(user.uid);
  const existingAdmin = await adminRef.get();

  await adminRef.set({
    role: 'admin',
    active: true,
    name,
    email: user.email || email,
    createdAt: existingAdmin.data()?.createdAt || FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  console.info(`[admin:provision] Active admin document created for ${user.email} in ${EXPECTED_PROJECT_ID}.`);
};

provisionAdmin().catch((error) => {
  fail(error?.message || String(error));
});
