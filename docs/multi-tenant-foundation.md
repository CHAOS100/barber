# Multi-tenant foundation

This document describes Phase 1 of the conversion from the legacy OST BARBER
single-business application to a multi-tenant appointment SaaS. It is an
architecture boundary, not a data migration or production cutover.

## Non-negotiable tenant invariant

Every new business-sensitive repository, callable, trigger, storage path, and
rule must receive or derive a validated `businessId`. There is no default
business ID in the tenant APIs. A URL parameter, root `users/{uid}.role`, or
client-provided owner ID never grants access by itself.

Authorization is based on one of these server-verifiable documents:

- `platformAdmins/{uid}` with `role: "platform_admin"` and `active: true`.
- `businesses/{businessId}/members/{uid}` with `role` equal to
  `business_owner` or `staff` and `active: true`.

`businesses/{businessId}.ownerUid` is business metadata and an indexing aid.
The owner membership document remains the authorization source of truth. New
business provisioning must create the business and its owner membership in one
trusted server transaction.

## Target data model

```text
users/{uid}                                  global identity/profile
platformAdmins/{uid}                        platform-wide privileged role
businesses/{businessId}                     public tenant metadata
  members/{uid}                             tenant authorization source
  services/{serviceId}
  staff/{staffId}
  appointments/{appointmentId}
  customers/{customerId}                    tenant-specific customer state
    notifications/{notificationId}
  reviews/{reviewId}
  gallery/{itemId}
  notificationJobs/{jobId}
  waitingList/{entryId}
  settings/business
  settings/booking
  appointmentBlocks/{appointmentId}
  bookingSlotReleases/{releaseId}
  appointmentScheduleLocks/{staffDateKey}
  customerBookingLocks/{customerId}
  waitingListCustomerLocks/{customerId}
```

The lock and operational collections are intentionally inside the tenant.
This ensures identical staff IDs, customer IDs, dates, or appointment IDs in
two businesses cannot collide.

### Business document

```js
{
  name: string,
  slug: string,                    // lowercase kebab-case, globally unique
  status: 'pending' | 'active' | 'suspended' | 'archived',
  ownerUid: string,
  phone: string,
  whatsapp: string,
  address: string,
  description: string,
  logoUrl: string,
  coverUrl: string,
  accentColor: '#RRGGBB',
  createdAt: Timestamp,
  updatedAt: Timestamp,
  subscription: {
    plan: string,
    status: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'inactive'
  }
}
```

### Membership document

```js
{
  role: 'business_owner' | 'staff',
  active: boolean,
  staffId: string | null,          // optional link to staff profile
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Platform administrator document

```js
{
  role: 'platform_admin',
  active: true,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

## Foundation code

- `src/domain/tenant.js` owns roles, statuses, validation, and normalization.
- `src/lib/tenantPaths.js` builds allow-listed tenant paths and fails closed
  without a valid `businessId`.
- `src/lib/tenantFirestore.js` resolves businesses by ID/slug and creates
  tenant-scoped Firestore references.
- `src/lib/accessControl.js` provides pure role and permission helpers.
- `AuthorizationContext` resolves Firebase identity and the separate platform
  administrator document.
- `BusinessContext` exposes `businessId`, `business`, `businessSlug`,
  `loading`, and `error`, plus the active membership/principal/repository.
- `functions/src/tenantScope.js` is the server-side path and access adapter for
  later callable/trigger migrations.

The existing repositories are deliberately not redirected. They still point
to the legacy root collections until each workflow is migrated and verified.

## Routing foundation

```text
/b/:businessSlug

/business/:businessId/dashboard
/business/:businessId/appointments
/business/:businessId/services
/business/:businessId/staff
/business/:businessId/customers
/business/:businessId/settings

/platform-admin
/platform-admin/businesses
```

The new routes use tenant-aware providers and guards. Existing `/`, `/booking`,
and `/admin/*` routes remain the legacy OST BARBER compatibility surface.

## Firestore and Storage rule strategy

The local rules include both legacy rules and the new tenant hierarchy:

- Active public tenant data is readable only from active businesses.
- Owner/staff access requires an active membership at the exact business path.
- Root user roles and auth token claims do not grant tenant access.
- Platform access requires the separate active `platformAdmins/{uid}` document.
- Membership writes are server-only to prevent self-promotion.
- Appointment mutations, reviews, notification jobs, and all booking locks stay
  server-only.
- Owners may manage tenant catalog/settings content; staff cannot elevate their
  own permissions or manage owner-only content.
- Tenant Storage writes use the same owner/platform-admin membership checks.

Rules tests explicitly cover changing a `businessId` in the path, spoofed role
claims, inactive memberships, server-only locks, and platform-admin access.

These rules are local only and must not be deployed until a new Firebase
project and a reviewed migration/cutover plan are supplied.

## Single-business assumptions inventory

### Frontend data layer

| Area | Current single-business assumption | Migration boundary |
| --- | --- | --- |
| `appointmentsFirestore.js` | Root `appointments`; callables receive no `businessId` | Move reads and every callable payload to tenant scope together |
| `businessFirestore.js` | Root `services`, `barbers`, `settings`, `appointmentBlocks`, `bookingSlotReleases`; root Storage paths | Split into services/staff/settings/availability tenant repositories |
| `waitingListFirestore.js` | Root `waitingList`; callable has no tenant scope | Migrate with server customer lock and matching logic |
| `reviewsFirestore.js` | Root `reviews`; appointment IDs assumed globally unique | Migrate with appointment validation function |
| `galleryFirestore.js` | Root `gallery`, root `admins`, root Storage gallery path | Migrate Firestore and Storage paths atomically |
| `notificationJobsFirestore.js` | Root `notificationJobs` | Replace with tenant job repository |
| `customerProfilesFirestore.js` | Root `users` combines global identity and business customer state | Keep identity root; move blocks/stats/spend to tenant customers |
| `customerNotificationsFirestore.js` | Root customer notification/message/batch collections and global customer targeting | Scope business-originated messages and batches |
| `customerMessagesFirestore.js` | Root messages, waiting list, and users queries | Scope all business audiences |
| `pushNotifications.js` | Global `users/{uid}/pushTokens` and OST channel text | Tokens may stay global; each job must carry business identity |

The realtime hooks in `useBookingData`, `useAppointmentsRealtime`,
`useReviewsRealtime`, `useGalleryRealtime`, `useCustomerProfilesRealtime`, and
`useCustomerMessages` inherit those global paths. All customer and admin pages
using those hooks therefore remain legacy until their repository is migrated.

### Frontend routes, authorization, and presentation

- `App.jsx` previously exposed only one public route set and one `/admin` area.
- `AdminRoute.jsx`, `firebase.js`, `galleryFirestore.js`, and the login flow use
  root `admins/{uid}` with legacy role `admin`.
- Admin navigation contains global `/admin/*` links with no tenant identifier.
- Home, login, gallery, splash, admin dashboard, notification copy, calendar
  export, Capacitor app metadata, manifest/icons, and several file names contain
  OST BARBER branding.
- Home/booking/login read one global settings document.
- Dashboard/analytics/customer cards aggregate all root appointments, reviews,
  users, and waiting-list entries as one business.

These are retained as OST tenant/legacy content in Phase 1. New platform and
tenant foundation code contains no OST fallback name.

### Cloud Functions

| File | Root-scoped behavior to migrate |
| --- | --- |
| `appointments.js` | Settings, services, barbers, appointments, waiting list, customer/schedule locks, customer policy checks |
| `waitingList.js` | Booking settings, services, barbers, appointments, list entries, customer locks, legacy admin check |
| `reviews.js` | Appointments, reviews, users, globally unique review IDs |
| `barbers.js` | Root barber lifecycle callable |
| `auth.js` | Root legacy admin lookup |
| `customerProfiles.js` | Global phone lookup and appointment attachment |
| `customerStats.js` | Root appointment/review triggers and global counters/locks |
| `appointmentMaintenance.js` | Global appointment maintenance query |
| `index.js` | Root appointment/user triggers, settings, blocks, releases, waiting list, notification jobs, audiences, barber deactivation, scheduled processing |
| `notifications/*` | Root jobs, appointments, customer notifications and hardcoded OST copy |

No existing callable or trigger was partially moved in Phase 1. Partial moves
would break transactional conflict checks or cause old and new triggers to
process different documents.

### Firebase rules, indexes, scripts, and configuration

- Legacy Firestore rules match root collections and use `admins/{uid}`.
- Legacy Storage paths are `/gallery`, `/barbers`, and `/settings`.
- Existing indexes were designed for root collection queries. Collection-scope
  appointment/waiting/job indexes also apply to same-named tenant collections;
  a business `slug + status` index was added for public slug routing.
- `provision-admin.mjs` and `resetAppData.mjs` pin the existing OST Firebase
  project and operate on root collections. They must not be used for the SaaS.
- Firebase configuration previously embedded the OST production project/API
  key in source. It now uses environment-provided optional safety pins, allowing
  a future project switch only when explicit credentials are supplied.
- `firebase.json` still identifies the local rule/function files but performs no
  deployment automatically.
- Capacitor app ID/name/assets remain the OST native tenant identity in Phase 1
  to preserve compatibility and the single-business backup.

## Remaining phases

1. **New environment and tenant provisioning:** receive explicit Firebase/Vercel
   configuration; build trusted business/slug/membership provisioning; create
   OST BARBER as the first tenant without touching the old project.
2. **Public tenant reads:** migrate business settings, services, staff, gallery,
   and published reviews; connect `/b/:slug` to real tenant booking UI.
3. **Identity and business workspace:** add owner/staff login/onboarding and move
   admin pages from `/admin/*` to scoped routes.
4. **Booking core:** migrate appointment/wait-list callables, availability,
   blocks, releases, transactions, active-customer locks, and triggers as one
   reviewed unit. Preserve all current concurrency guarantees.
5. **Tenant customers and reviews:** split global identity from per-business
   block/status/stats/spend and migrate completed-appointment review rules.
6. **Notifications:** tenant-scope jobs, inbox records, templates, schedules,
   audiences, and business-specific copy. Keep unsupported WhatsApp disabled.
7. **Statistics and maintenance:** tenant-scope dashboards, scheduled jobs,
   automatic completion, cleanup, and analytics.
8. **Storage/native/cutover:** tenant storage paths, platform branding, tenant
   theme assets, Capacitor strategy, data verification, preview QA, and an
   explicitly approved deployment/cutover.

Phase 2 must not begin automatically.
