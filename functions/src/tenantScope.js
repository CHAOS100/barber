export const PLATFORM_ADMIN_ROLE = 'platform_admin';
export const BUSINESS_OWNER_ROLE = 'business_owner';
export const BUSINESS_STAFF_ROLE = 'staff';

export const TENANT_COLLECTIONS = Object.freeze({
  services: 'services',
  staff: 'staff',
  appointments: 'appointments',
  customers: 'customers',
  reviews: 'reviews',
  gallery: 'gallery',
  notificationJobs: 'notificationJobs',
  waitingList: 'waitingList',
  appointmentBlocks: 'appointmentBlocks',
  bookingSlotReleases: 'bookingSlotReleases',
  appointmentScheduleLocks: 'appointmentScheduleLocks',
  customerBookingLocks: 'customerBookingLocks',
  waitingListCustomerLocks: 'waitingListCustomerLocks',
});

const BUSINESS_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const scopeError = (code, message) => Object.assign(new Error(message), { code });

export const requireBusinessId = (value) => {
  const businessId = String(value || '').trim();
  if (!BUSINESS_ID_PATTERN.test(businessId)) {
    throw scopeError('invalid-argument', 'A valid businessId is required.');
  }
  return businessId;
};

const requireDocumentId = (value, label) => {
  const id = String(value || '').trim();
  if (!id || id.includes('/')) throw scopeError('invalid-argument', `A valid ${label} is required.`);
  return id;
};

export const businessDocumentPath = (businessId) => (
  `businesses/${requireBusinessId(businessId)}`
);

export const businessMembershipPath = (businessId, uid) => (
  `${businessDocumentPath(businessId)}/members/${requireDocumentId(uid, 'uid')}`
);

export const tenantCollectionPath = (businessId, collectionName) => {
  const normalizedCollection = String(collectionName || '').trim();
  if (!Object.values(TENANT_COLLECTIONS).includes(normalizedCollection)) {
    throw scopeError('invalid-argument', `Unsupported tenant collection: ${normalizedCollection}`);
  }
  return `${businessDocumentPath(businessId)}/${normalizedCollection}`;
};

export const tenantDocumentPath = (businessId, collectionName, documentId) => (
  `${tenantCollectionPath(businessId, collectionName)}/${requireDocumentId(documentId, 'documentId')}`
);

export const tenantSettingsPath = (businessId, settingName) => {
  const normalizedSetting = String(settingName || '').trim();
  if (!['business', 'booking'].includes(normalizedSetting)) {
    throw scopeError('invalid-argument', `Unsupported tenant setting: ${normalizedSetting}`);
  }
  return `${businessDocumentPath(businessId)}/settings/${normalizedSetting}`;
};

export const isActiveTenantMembership = (membership, allowedRoles = [
  BUSINESS_OWNER_ROLE,
  BUSINESS_STAFF_ROLE,
]) => (
  membership?.active === true && allowedRoles.includes(membership.role)
);

export const assertTenantAccess = async ({
  firestore,
  uid,
  businessId,
  allowedRoles = [BUSINESS_OWNER_ROLE, BUSINESS_STAFF_ROLE],
}) => {
  const normalizedUid = requireDocumentId(uid, 'uid');
  const normalizedBusinessId = requireBusinessId(businessId);
  const [platformAdminSnapshot, membershipSnapshot] = await Promise.all([
    firestore.doc(`platformAdmins/${normalizedUid}`).get(),
    firestore.doc(businessMembershipPath(normalizedBusinessId, normalizedUid)).get(),
  ]);

  const platformAdmin = platformAdminSnapshot.exists ? platformAdminSnapshot.data() : null;
  if (platformAdmin?.active === true && platformAdmin.role === PLATFORM_ADMIN_ROLE) {
    return {
      businessId: normalizedBusinessId,
      uid: normalizedUid,
      role: PLATFORM_ADMIN_ROLE,
      membership: null,
    };
  }

  const membership = membershipSnapshot.exists ? membershipSnapshot.data() : null;
  if (!isActiveTenantMembership(membership, allowedRoles)) {
    throw scopeError('permission-denied', 'The caller cannot access this business.');
  }

  return {
    businessId: normalizedBusinessId,
    uid: normalizedUid,
    role: membership.role,
    membership,
  };
};
