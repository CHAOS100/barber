import { isBusinessRole, USER_ROLES } from '../domain/tenant.js';

const activePlatformAdmin = (user) => (
  user?.platformAdmin?.active === true
  && user.platformAdmin.role === USER_ROLES.PLATFORM_ADMIN
);

export const createAuthorizationPrincipal = (firebaseUser, platformAdmin = null) => ({
  uid: String(firebaseUser?.uid || '').trim(),
  email: String(firebaseUser?.email || '').trim(),
  phoneNumber: String(firebaseUser?.phoneNumber || '').trim(),
  role: activePlatformAdmin({ platformAdmin })
    ? USER_ROLES.PLATFORM_ADMIN
    : USER_ROLES.CUSTOMER,
  platformAdmin,
  businessMemberships: {},
});

export const withBusinessMembership = (user, businessId, membership) => {
  if (!user) return null;
  return {
    ...user,
    businessMemberships: {
      ...(user.businessMemberships || {}),
      [businessId]: membership || null,
    },
  };
};

export const getBusinessMembership = (user, businessId) => (
  user?.businessMemberships?.[businessId] || null
);

export const isPlatformAdmin = (user) => activePlatformAdmin(user);

export const isBusinessOwner = (user, businessId) => {
  const membership = getBusinessMembership(user, businessId);
  return membership?.active === true && membership.role === USER_ROLES.BUSINESS_OWNER;
};

export const isBusinessStaff = (user, businessId) => {
  const membership = getBusinessMembership(user, businessId);
  return membership?.active === true && membership.role === USER_ROLES.STAFF;
};

export const canAccessBusiness = (user, businessId) => (
  isPlatformAdmin(user)
  || isBusinessOwner(user, businessId)
  || isBusinessStaff(user, businessId)
);

export const canManageBusiness = (user, businessId) => (
  isPlatformAdmin(user) || isBusinessOwner(user, businessId)
);

export const isActiveBusinessMembership = (membership) => (
  membership?.active === true && isBusinessRole(membership.role)
);

export const assertBusinessAccess = (user, businessId) => {
  if (!canAccessBusiness(user, businessId)) {
    throw Object.assign(new Error('You do not have access to this business.'), {
      code: 'tenant/access-denied',
    });
  }
  return true;
};
