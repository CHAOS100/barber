import React from 'react';
import { useAuthorization } from '@/components/auth/AuthorizationContext';
import { withBusinessMembership } from '@/lib/accessControl';
import { normalizeBusinessId, normalizeBusinessSlug } from '@/domain/tenant';
import {
  createTenantRepository,
  subscribeToBusinessById,
  subscribeToBusinessBySlug,
  subscribeToBusinessMembership,
} from '@/lib/tenantFirestore';

const BusinessContext = React.createContext(null);

const tenantNotFoundError = () => Object.assign(
  new Error('The requested business was not found or is not available.'),
  { code: 'tenant/business-not-found' },
);

export function BusinessProvider({ businessId: rawBusinessId, businessSlug: rawBusinessSlug, children }) {
  const authorization = useAuthorization();
  const [business, setBusiness] = React.useState(null);
  const [businessLoading, setBusinessLoading] = React.useState(true);
  const [businessError, setBusinessError] = React.useState(null);
  const [membership, setMembership] = React.useState(null);
  const [membershipLoading, setMembershipLoading] = React.useState(false);
  const [membershipError, setMembershipError] = React.useState(null);

  const requestedScope = React.useMemo(() => {
    try {
      const hasBusinessId = Boolean(String(rawBusinessId || '').trim());
      const hasBusinessSlug = Boolean(String(rawBusinessSlug || '').trim());
      if (hasBusinessId === hasBusinessSlug) {
        throw Object.assign(
          new Error('BusinessProvider requires exactly one businessId or businessSlug.'),
          { code: 'tenant/ambiguous-scope' },
        );
      }
      return hasBusinessId
        ? { businessId: normalizeBusinessId(rawBusinessId), businessSlug: '' }
        : { businessId: '', businessSlug: normalizeBusinessSlug(rawBusinessSlug) };
    } catch (nextError) {
      return { businessId: '', businessSlug: '', error: nextError };
    }
  }, [rawBusinessId, rawBusinessSlug]);

  React.useEffect(() => {
    setBusiness(null);
    setBusinessError(requestedScope.error || null);

    if (requestedScope.error) {
      setBusinessLoading(false);
      return undefined;
    }

    setBusinessLoading(true);
    const subscribe = requestedScope.businessId
      ? subscribeToBusinessById
      : subscribeToBusinessBySlug;
    const scopeValue = requestedScope.businessId || requestedScope.businessSlug;

    let active = true;
    const unsubscribe = subscribe(
      scopeValue,
      (nextBusiness) => {
        if (!active) return;
        setBusiness(nextBusiness);
        setBusinessError(nextBusiness ? null : tenantNotFoundError());
        setBusinessLoading(false);
      },
      (nextError) => {
        if (!active) return;
        setBusiness(null);
        setBusinessError(nextError);
        setBusinessLoading(false);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [requestedScope]);

  const resolvedBusinessId = requestedScope.businessId || business?.id || '';
  const authenticatedUid = authorization.firebaseUser?.uid || '';

  React.useEffect(() => {
    setMembership(null);
    setMembershipError(null);

    if (!resolvedBusinessId || !authenticatedUid) {
      setMembershipLoading(false);
      return undefined;
    }

    setMembershipLoading(true);
    let active = true;
    const unsubscribe = subscribeToBusinessMembership(
      resolvedBusinessId,
      authenticatedUid,
      (nextMembership) => {
        if (!active) return;
        setMembership(nextMembership);
        setMembershipLoading(false);
      },
      (nextError) => {
        if (!active) return;
        setMembership(null);
        setMembershipError(nextError);
        setMembershipLoading(false);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [authenticatedUid, resolvedBusinessId]);

  const principal = React.useMemo(() => (
    authorization.principal && resolvedBusinessId
      ? withBusinessMembership(authorization.principal, resolvedBusinessId, membership)
      : authorization.principal
  ), [authorization.principal, membership, resolvedBusinessId]);

  const repository = React.useMemo(() => (
    resolvedBusinessId ? createTenantRepository(resolvedBusinessId) : null
  ), [resolvedBusinessId]);

  const value = React.useMemo(() => ({
    businessId: resolvedBusinessId,
    business,
    businessSlug: business?.slug || requestedScope.businessSlug || '',
    loading: businessLoading
      || authorization.loading
      || (Boolean(authenticatedUid && resolvedBusinessId) && membershipLoading),
    error: businessError || authorization.error || membershipError,
    membership,
    principal,
    repository,
  }), [
    authenticatedUid,
    authorization.error,
    authorization.loading,
    business,
    businessError,
    businessLoading,
    membership,
    membershipError,
    membershipLoading,
    principal,
    repository,
    requestedScope.businessSlug,
    resolvedBusinessId,
  ]);

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export const useBusiness = () => {
  const context = React.useContext(BusinessContext);
  if (!context) {
    throw new Error('useBusiness must be used inside BusinessProvider.');
  }
  return context;
};
