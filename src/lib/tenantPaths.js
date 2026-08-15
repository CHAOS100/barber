import { normalizeBusinessId } from '../domain/tenant.js';

export const TENANT_COLLECTIONS = Object.freeze({
  SERVICES: 'services',
  STAFF: 'staff',
  APPOINTMENTS: 'appointments',
  CUSTOMERS: 'customers',
  REVIEWS: 'reviews',
  GALLERY: 'gallery',
  NOTIFICATION_JOBS: 'notificationJobs',
  WAITING_LIST: 'waitingList',
  MEMBERS: 'members',
  APPOINTMENT_BLOCKS: 'appointmentBlocks',
  BOOKING_SLOT_RELEASES: 'bookingSlotReleases',
  APPOINTMENT_SCHEDULE_LOCKS: 'appointmentScheduleLocks',
  CUSTOMER_BOOKING_LOCKS: 'customerBookingLocks',
  WAITING_LIST_CUSTOMER_LOCKS: 'waitingListCustomerLocks',
  CUSTOMER_NOTIFICATIONS: 'customerNotifications',
});

export const TENANT_SETTINGS = Object.freeze({
  BUSINESS: 'business',
  BOOKING: 'booking',
});

const tenantCollectionNames = new Set(Object.values(TENANT_COLLECTIONS));
const tenantSettingNames = new Set(Object.values(TENANT_SETTINGS));

const requireDocumentId = (value, label) => {
  const id = String(value || '').trim();
  if (!id || id.includes('/')) {
    throw Object.assign(new Error(`A valid ${label} is required.`), {
      code: `tenant/invalid-${label}`,
    });
  }
  return id;
};

export const businessPath = (businessId) => `businesses/${normalizeBusinessId(businessId)}`;

export const platformAdminPath = (uid) => (
  `platformAdmins/${requireDocumentId(uid, 'uid')}`
);

export const businessMembershipPath = (businessId, uid) => (
  `${businessPath(businessId)}/members/${requireDocumentId(uid, 'uid')}`
);

export const tenantCollectionPath = (businessId, collectionName) => {
  if (!tenantCollectionNames.has(collectionName)) {
    throw Object.assign(new Error(`Unsupported tenant collection: ${collectionName}`), {
      code: 'tenant/unsupported-collection',
    });
  }
  return `${businessPath(businessId)}/${collectionName}`;
};

export const tenantDocumentPath = (businessId, collectionName, documentId) => (
  `${tenantCollectionPath(businessId, collectionName)}/${requireDocumentId(documentId, 'document-id')}`
);

export const tenantSettingsPath = (businessId, settingName) => {
  if (!tenantSettingNames.has(settingName)) {
    throw Object.assign(new Error(`Unsupported tenant setting: ${settingName}`), {
      code: 'tenant/unsupported-setting',
    });
  }
  return `${businessPath(businessId)}/settings/${settingName}`;
};
