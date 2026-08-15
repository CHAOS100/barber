import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canAccessBusiness,
  canManageBusiness,
  createAuthorizationPrincipal,
  isBusinessOwner,
  isBusinessStaff,
  isPlatformAdmin,
  withBusinessMembership,
} from '../src/lib/accessControl.js';
import { normalizeBusiness } from '../src/domain/tenant.js';
import {
  businessMembershipPath,
  tenantCollectionPath,
  tenantDocumentPath,
  tenantSettingsPath,
} from '../src/lib/tenantPaths.js';

test('business model normalizes the requested SaaS fields without an OST fallback', () => {
  const business = normalizeBusiness('business-a', {
    name: 'Tenant A',
    slug: 'tenant-a',
    status: 'active',
    ownerUid: 'owner-a',
    phone: '0500000000',
    whatsapp: '972500000000',
    address: 'Israel',
    description: 'Description',
    logoUrl: 'https://example.com/logo.png',
    coverUrl: 'https://example.com/cover.png',
    accentColor: '#112233',
    subscription: { plan: 'pro', status: 'active' },
  });

  assert.equal(business.name, 'Tenant A');
  assert.equal(business.slug, 'tenant-a');
  assert.equal(business.subscription.plan, 'pro');
  assert.equal(business.accentColor, '#112233');
});

test('tenant path helpers fail closed without explicit business scope', () => {
  assert.equal(
    tenantCollectionPath('business-a', 'services'),
    'businesses/business-a/services',
  );
  assert.equal(
    tenantDocumentPath('business-a', 'appointments', 'appointment-a'),
    'businesses/business-a/appointments/appointment-a',
  );
  assert.equal(
    businessMembershipPath('business-a', 'owner-a'),
    'businesses/business-a/members/owner-a',
  );
  assert.equal(
    tenantSettingsPath('business-a', 'business'),
    'businesses/business-a/settings/business',
  );
  assert.throws(() => tenantCollectionPath('', 'services'), /businessId/);
});

test('a root role cannot grant cross-tenant access without an active membership', () => {
  const spoofed = {
    uid: 'owner-a',
    role: 'business_owner',
    businessMemberships: {},
  };
  assert.equal(canAccessBusiness(spoofed, 'business-a'), false);
  assert.equal(canAccessBusiness(spoofed, 'business-b'), false);
});

test('owner and staff access is scoped to exactly one business', () => {
  const base = createAuthorizationPrincipal({ uid: 'member-a' });
  const owner = withBusinessMembership(base, 'business-a', {
    businessId: 'business-a',
    uid: 'member-a',
    role: 'business_owner',
    active: true,
  });
  assert.equal(isBusinessOwner(owner, 'business-a'), true);
  assert.equal(canManageBusiness(owner, 'business-a'), true);
  assert.equal(canAccessBusiness(owner, 'business-b'), false);

  const staff = withBusinessMembership(base, 'business-a', {
    businessId: 'business-a',
    uid: 'member-a',
    role: 'staff',
    active: true,
  });
  assert.equal(isBusinessStaff(staff, 'business-a'), true);
  assert.equal(canAccessBusiness(staff, 'business-a'), true);
  assert.equal(canManageBusiness(staff, 'business-a'), false);
});

test('platform admin access requires the separate active platform document', () => {
  const enabled = createAuthorizationPrincipal(
    { uid: 'platform-a' },
    { role: 'platform_admin', active: true },
  );
  const disabled = createAuthorizationPrincipal(
    { uid: 'platform-b' },
    { role: 'platform_admin', active: false },
  );
  assert.equal(isPlatformAdmin(enabled), true);
  assert.equal(canAccessBusiness(enabled, 'business-z'), true);
  assert.equal(isPlatformAdmin(disabled), false);
});
