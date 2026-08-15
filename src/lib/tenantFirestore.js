import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase';
import {
  normalizeBusiness,
  normalizeBusinessId,
  normalizeBusinessMembership,
  normalizeBusinessSlug,
  BUSINESS_STATUSES,
  USER_ROLES,
} from '@/domain/tenant';
import {
  businessMembershipPath,
  businessPath,
  platformAdminPath,
  tenantCollectionPath,
  tenantDocumentPath,
  tenantSettingsPath,
} from '@/lib/tenantPaths';

const tenantError = (code, message) => Object.assign(new Error(message), { code });

const mapBusinessSnapshot = (snapshot) => {
  if (!snapshot.exists()) return null;
  return normalizeBusiness(snapshot.id, snapshot.data());
};

export const subscribeToBusinessById = (businessId, onData, onError) => {
  const normalizedBusinessId = normalizeBusinessId(businessId);
  return onSnapshot(
    doc(getFirestoreDb(), businessPath(normalizedBusinessId)),
    (snapshot) => {
      try {
        onData(mapBusinessSnapshot(snapshot));
      } catch (nextError) {
        onError?.(nextError);
      }
    },
    onError,
  );
};

export const subscribeToBusinessBySlug = (businessSlug, onData, onError) => {
  const normalizedSlug = normalizeBusinessSlug(businessSlug);
  return onSnapshot(
    query(
      collection(getFirestoreDb(), 'businesses'),
      where('slug', '==', normalizedSlug),
      where('status', '==', BUSINESS_STATUSES.ACTIVE),
      limit(2),
    ),
    (snapshot) => {
      if (snapshot.size > 1) {
        onError?.(tenantError(
          'tenant/duplicate-business-slug',
          `Business slug "${normalizedSlug}" is not unique.`,
        ));
        return;
      }
      try {
        onData(snapshot.empty ? null : mapBusinessSnapshot(snapshot.docs[0]));
      } catch (nextError) {
        onError?.(nextError);
      }
    },
    onError,
  );
};

export const subscribeToBusinessMembership = (businessId, uid, onData, onError) => {
  const normalizedBusinessId = normalizeBusinessId(businessId);
  const normalizedUid = String(uid || '').trim();
  if (!normalizedUid) {
    onData(null);
    return () => {};
  }

  return onSnapshot(
    doc(getFirestoreDb(), businessMembershipPath(normalizedBusinessId, normalizedUid)),
    (snapshot) => onData(
      snapshot.exists()
        ? normalizeBusinessMembership(normalizedBusinessId, normalizedUid, snapshot.data())
        : null,
    ),
    onError,
  );
};

export const subscribeToPlatformAdmin = (uid, onData, onError) => onSnapshot(
  doc(getFirestoreDb(), platformAdminPath(uid)),
  (snapshot) => {
    const data = snapshot.data();
    onData(snapshot.exists() ? {
      uid: snapshot.id,
      role: data?.role,
      active: data?.active === true,
      createdAt: data?.createdAt || null,
      updatedAt: data?.updatedAt || null,
    } : null);
  },
  onError,
);

export const tenantCollectionRef = (businessId, collectionName) => (
  collection(getFirestoreDb(), tenantCollectionPath(businessId, collectionName))
);

export const tenantDocumentRef = (businessId, collectionName, documentId) => (
  doc(getFirestoreDb(), tenantDocumentPath(businessId, collectionName, documentId))
);

export const tenantSettingsRef = (businessId, settingName) => (
  doc(getFirestoreDb(), tenantSettingsPath(businessId, settingName))
);

export const createTenantRepository = (businessId) => {
  const scope = normalizeBusinessId(businessId);
  return Object.freeze({
    businessId: scope,
    business: () => doc(getFirestoreDb(), businessPath(scope)),
    collection: (collectionName) => tenantCollectionRef(scope, collectionName),
    document: (collectionName, documentId) => (
      tenantDocumentRef(scope, collectionName, documentId)
    ),
    settings: (settingName) => tenantSettingsRef(scope, settingName),
  });
};

export const isValidPlatformAdminDocument = (profile) => (
  profile?.active === true && profile.role === USER_ROLES.PLATFORM_ADMIN
);
