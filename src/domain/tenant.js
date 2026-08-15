export const USER_ROLES = Object.freeze({
  PLATFORM_ADMIN: 'platform_admin',
  BUSINESS_OWNER: 'business_owner',
  STAFF: 'staff',
  CUSTOMER: 'customer',
});

export const BUSINESS_STATUSES = Object.freeze({
  PENDING: 'pending',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  ARCHIVED: 'archived',
});

export const SUBSCRIPTION_STATUSES = Object.freeze({
  TRIALING: 'trialing',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELLED: 'cancelled',
  INACTIVE: 'inactive',
});

export const DEFAULT_ACCENT_COLOR = '#93E3BD';

const BUSINESS_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const BUSINESS_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

const tenantError = (code, message) => Object.assign(new Error(message), { code });

export const normalizeBusinessId = (value) => {
  const businessId = String(value || '').trim();
  if (!BUSINESS_ID_PATTERN.test(businessId)) {
    throw tenantError('tenant/invalid-business-id', 'A valid businessId is required.');
  }
  return businessId;
};

export const normalizeBusinessSlug = (value) => {
  const businessSlug = String(value || '').trim().toLowerCase();
  if (!BUSINESS_SLUG_PATTERN.test(businessSlug)) {
    throw tenantError('tenant/invalid-business-slug', 'A valid business slug is required.');
  }
  return businessSlug;
};

export const normalizeBusiness = (businessId, data = {}) => ({
  id: normalizeBusinessId(businessId),
  name: String(data.name || '').trim(),
  slug: normalizeBusinessSlug(data.slug),
  status: Object.values(BUSINESS_STATUSES).includes(data.status)
    ? data.status
    : BUSINESS_STATUSES.PENDING,
  ownerUid: String(data.ownerUid || '').trim(),
  phone: String(data.phone || '').trim(),
  whatsapp: String(data.whatsapp || '').trim(),
  address: String(data.address || '').trim(),
  description: String(data.description || '').trim(),
  logoUrl: String(data.logoUrl || '').trim(),
  coverUrl: String(data.coverUrl || '').trim(),
  accentColor: HEX_COLOR_PATTERN.test(String(data.accentColor || ''))
    ? data.accentColor
    : DEFAULT_ACCENT_COLOR,
  subscription: {
    plan: String(data.subscription?.plan || 'free').trim(),
    status: Object.values(SUBSCRIPTION_STATUSES).includes(data.subscription?.status)
      ? data.subscription.status
      : SUBSCRIPTION_STATUSES.INACTIVE,
  },
  createdAt: data.createdAt || null,
  updatedAt: data.updatedAt || null,
});

export const normalizeBusinessMembership = (businessId, uid, data = {}) => ({
  businessId: normalizeBusinessId(businessId),
  uid: String(uid || '').trim(),
  role: data.role,
  active: data.active === true,
  staffId: String(data.staffId || '').trim() || null,
  createdAt: data.createdAt || null,
  updatedAt: data.updatedAt || null,
});

export const isBusinessRole = (role) => (
  role === USER_ROLES.BUSINESS_OWNER || role === USER_ROLES.STAFF
);
