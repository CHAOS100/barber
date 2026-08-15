import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertTenantAccess,
  businessDocumentPath,
  businessMembershipPath,
  isActiveTenantMembership,
  tenantCollectionPath,
  tenantDocumentPath,
  tenantSettingsPath,
} from '../src/tenantScope.js';

const fakeFirestore = (documents = {}) => ({
  doc: (path) => ({
    get: async () => ({
      exists: Object.hasOwn(documents, path),
      data: () => documents[path],
    }),
  }),
});

test('tenant paths always include an explicit business id', () => {
  assert.equal(businessDocumentPath('business-a'), 'businesses/business-a');
  assert.equal(
    businessMembershipPath('business-a', 'owner-a'),
    'businesses/business-a/members/owner-a',
  );
  assert.equal(
    tenantCollectionPath('business-a', 'appointments'),
    'businesses/business-a/appointments',
  );
  assert.equal(
    tenantDocumentPath('business-a', 'appointments', 'appointment-1'),
    'businesses/business-a/appointments/appointment-1',
  );
  assert.equal(
    tenantSettingsPath('business-a', 'booking'),
    'businesses/business-a/settings/booking',
  );
  assert.throws(() => tenantCollectionPath('', 'appointments'), /businessId/);
  assert.throws(() => tenantCollectionPath('business-a', 'unknown'), /Unsupported/);
});

test('only active owner/staff memberships are accepted', () => {
  assert.equal(isActiveTenantMembership({ role: 'business_owner', active: true }), true);
  assert.equal(isActiveTenantMembership({ role: 'staff', active: true }), true);
  assert.equal(isActiveTenantMembership({ role: 'staff', active: false }), false);
  assert.equal(isActiveTenantMembership({ role: 'customer', active: true }), false);
});

test('server access helper isolates memberships by business id', async () => {
  const firestore = fakeFirestore({
    'businesses/business-a/members/owner-a': { role: 'business_owner', active: true },
  });

  const allowed = await assertTenantAccess({
    firestore,
    uid: 'owner-a',
    businessId: 'business-a',
  });
  assert.equal(allowed.role, 'business_owner');

  await assert.rejects(
    assertTenantAccess({ firestore, uid: 'owner-a', businessId: 'business-b' }),
    (error) => error.code === 'permission-denied',
  );
});

test('active platform administrators can access every tenant', async () => {
  const firestore = fakeFirestore({
    'platformAdmins/platform-admin': { role: 'platform_admin', active: true },
  });
  const allowed = await assertTenantAccess({
    firestore,
    uid: 'platform-admin',
    businessId: 'business-b',
  });
  assert.equal(allowed.role, 'platform_admin');
});
