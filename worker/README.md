# NightSafe API (Cloudflare Worker + D1 + R2)

NightSafe's backend provides authentication, role-based access control,
property/unit management, tenant and agent management, rent and utility
payments, deposits, agreements, notifications, and Admin account controls.

## Setup

```bash
cd worker
npm install
wrangler d1 create nightsafe-db
wrangler r2 bucket create nightsafe-files
npm run db:migrate:local
npm run dev
```

Production and staging deployments are performed by GitHub Actions; production
migrations and Worker deployment run automatically for Worker changes merged to
`main`. See `STAGING.md` for the isolated manual staging workflow.

## Schema

Migrations live in `migrations/`, applied in order via `wrangler d1 migrations apply`:

- `0001_auth.sql` — `users`, `sessions`, `invitations`
- `0002_core_schema.sql` — properties, units, assignments, leases, payments, agreements, notifications, audit logs
- `0003_tenant_creation.sql` — tenant activation status, phone, lease due day/deposit
- `0004_agent_management.sql` — inactive user status and `users.created_by`
- `0005_payment_review_tracking.sql` — rent payment review metadata
- `0006_unit_leader_utilities.sql` — Unit Leader assignment and utility review metadata
- `0007_deposits.sql` — deposit items, payments, deductions, and returns
- `0008_property_unit_archive.sql` — archive support for properties and units
- `0009_admin_role.sql` — internal `ADMIN` role
- `0010_super_admin.sql` — `primary_admins` marker; marked ADMIN sessions are exposed as `SUPER_ADMIN`
- `0011_active_assignment_guards.sql` — one ACTIVE lease per unit
- `0012_login_rate_limits.sql` — hashed failed-login throttling state
- `0013_single_primary_admin.sql` — one Primary Admin marker
- `0014_business_invariants.sql` — assignment uniqueness, archived-target, Unit Leader, and deposit monetary guards
- `0015_archived_inventory_write_guard.sql` — blocks new units under archived properties

CI applies the full migration chain to a fresh local D1 and deliberately tries
invalid writes. A PR fails if D1 accepts a duplicate Agent assignment, archived
inventory write, duplicate active Unit Leader, deposit overpayment,
over-deduction, or over-refund.

## Primary administrator

NightSafe has exactly one `SUPER_ADMIN` (shown as **Primary Admin** in the UI).
The database stores that account as `ADMIN` and marks it in `primary_admins`;
the Worker promotes that marked account to `SUPER_ADMIN` in session/API data.
It has all normal Admin capabilities plus the ability to invite additional
`ADMIN` accounts.

Production bootstrap has already been completed. The one-time bootstrap workflow
and bootstrap script are intentionally no longer kept in the repository.
Migration `0013_single_primary_admin.sql` prevents a second Primary Admin marker.

## Account management

In production, create normal Admin accounts from `/admin`. The Primary Admin
receives an activation link for each new Admin; no administrator password is
stored in source code or GitHub history.

OWNER creates Agents and Unit Leaders through their normal product flows. Tenant
accounts are invitation-based. Server-side validation rejects malformed account
emails even if a caller bypasses the browser form.

`SUPER_ADMIN` and `ADMIN` can list accounts, generate one-hour password-reset
links, and enable/disable activated accounts. Disabling an account removes its
existing sessions. Only `SUPER_ADMIN` can add Admin accounts, and a normal Admin
cannot reset or disable the Primary Admin.

Password reset reuses the one-time invitation mechanism. Only the newest reset
link remains valid. A disabled account may change its password using a reset link
but remains disabled until an Admin enables it.

## Browser/API architecture

Hosted browser traffic uses a Cloudflare Pages Function at `/api/*`. The browser
therefore talks to the same origin as the frontend and receives the HTTP-only
session cookie as a first-party cookie. The Pages Function proxies requests to
`nightsafe-api` (or to `nightsafe-staging` for the stable development preview).

The Pages proxy verifies the request Origin on unsafe methods before forwarding.
The Worker retains its own Origin/CSRF checks as a second layer. Direct Worker
access remains available for deployment diagnostics and non-browser clients, but
the production frontend does not need third-party cookies.

Sessions are HTTP-only and `Secure` outside local development. Repeated failed
logins are throttled by a hashed IP+email key in D1. Passwords are hashed with
PBKDF2-HMAC-SHA256 using a random salt and Workers Web Crypto.

## File security

Receipts and agreements are limited to PDF, PNG, and JPEG up to 10 MB. The
backend checks file signatures rather than trusting the uploaded MIME type,
stores objects under generated R2 keys, serves private files as attachments with
`nosniff`, and cleans R2 objects when related records are rolled back or removed.

## Business invariants

Important rules are enforced in both API behavior and D1 where possible:

- archived properties/units cannot receive new tenants or Agent assignments
- archived properties cannot receive new units
- exact duplicate Agent assignments are rejected
- one active/pending Unit Leader occupies a unit at a time
- Unit Leader replacement releases the old leader and assigns the new one in one D1 batch
- one ACTIVE lease can exist per unit
- deposit items cannot be overpaid
- deductions/returns cannot exceed refundable money actually paid and still held
- non-refundable deposit charges cannot be returned as refundable money

These D1 constraints are intentionally kept even when the UI already prevents
the action, so direct API/database writes cannot silently create invalid state.
