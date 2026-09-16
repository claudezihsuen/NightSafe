# NightSafe API (Cloudflare Worker + D1 + R2)

NightSafe's backend provides authentication, role-based access control,
property/unit management, tenant and agent management, rent and utility
payments, deposits, agreements, notifications, and Admin account controls.

## Setup

```bash
cd worker
npm install
wrangler d1 create nightsafe-db     # copy the returned database_id into wrangler.toml
wrangler r2 bucket create nightsafe-files
npm run db:migrate:local            # applies migrations/ in order
npm run dev                         # runs on http://localhost:8787
```

## Schema

Migrations live in `migrations/`, applied in order via `wrangler d1 migrations apply`:

- `0001_auth.sql` — `users`, `sessions`, `invitations`
- `0002_core_schema.sql` — `properties`, `units`, `agent_assignments`, `leases`,
  `rent_payments`, `utility_payments`, `agreements`, `notifications`, `audit_logs`
- `0003_tenant_creation.sql` — tenant activation status, phone, lease due day/deposit
- `0004_agent_management.sql` — inactive user status and `users.created_by`
- `0005_payment_review_tracking.sql` — rent payment review metadata
- `0006_unit_leader_utilities.sql` — Unit Leader assignment and utility review metadata
- `0007_deposits.sql` — deposit items, payments, deductions, and returns
- `0008_property_unit_archive.sql` — archive support for properties and units
- `0009_admin_role.sql` — adds the internal `ADMIN` role
- `0010_super_admin.sql` — adds the `primary_admins` marker table; marked ADMIN users are exposed as `SUPER_ADMIN`
- `0011_active_assignment_guards.sql` — enforces at most one ACTIVE lease per unit
- `0012_login_rate_limits.sql` — stores hashed failed-login throttling state
- `0013_single_primary_admin.sql` — makes `primary_admins` a true singleton

A property has many units; a unit reaches its tenant(s) through a lease; an
agent's access is granted through `agent_assignments`. Rent payments key off
`(lease_id, month)` and utility payments off `(unit_id, type, month)`.

## Primary administrator

NightSafe has exactly one `SUPER_ADMIN` (shown as **Primary Admin** in the UI).
The database stores that account as `ADMIN` and marks it in `primary_admins`;
the Worker promotes the marked account to `SUPER_ADMIN` in session/API data.
It has all normal Admin capabilities plus the ability to invite additional
`ADMIN` accounts.

For a brand-new database, `scripts/bootstrap-super-admin.mjs` can create the
initial one-time activation SQL after all migrations are applied. The deployed
production instance has already completed this bootstrap. Do not bootstrap a
second Primary Admin; migration `0013_single_primary_admin.sql` also prevents a
second marker at the database level.

## Seeding other privileged accounts

OWNER, AGENT, UNIT_LEADER, and development ADMIN accounts can be seeded with the
helper script. TENANT accounts use the invitation flow. In production, prefer
having the `SUPER_ADMIN` create normal Admin accounts from `/admin` so they use
the one-time activation flow instead of a preselected password.

```bash
node scripts/create-user.mjs "System Admin" admin@nightsafe.dev ADMIN a-strong-password
node scripts/create-user.mjs "Jane Owner" jane@nightsafe.dev OWNER a-strong-password
node scripts/create-user.mjs "Lee Ward" lee@nightsafe.dev UNIT_LEADER a-strong-password <unit-id>
```

## Admin account management

`SUPER_ADMIN` and `ADMIN` users sign in through the normal login page and are
routed to `/admin`. Both can list NightSafe accounts, generate one-hour
password-reset links, and enable/disable activated accounts. Disabling an
account also removes its existing sessions.

Only `SUPER_ADMIN` sees and can use **Add Admin Account**. It creates a normal
`ADMIN` in `WAITING_FOR_ACTIVATION` status and returns a seven-day activation
link. A normal Admin cannot create another Admin and cannot reset or disable the
primary administrator. The primary administrator itself cannot be disabled
through the Admin API.

Password reset reuses NightSafe's one-time invitation mechanism. Only the newest
reset link remains valid. A disabled account may change its password using a
reset link but remains disabled until an Admin enables it.

## Key endpoints

| Method | Path | Auth |
|---|---|---|
| POST | `/api/auth/login` | — |
| POST | `/api/auth/logout` | — |
| GET | `/api/auth/me` | session cookie |
| GET | `/api/auth/invite/:token` | — |
| POST | `/api/auth/activate/:token` | — |
| GET | `/api/admin/users` | ADMIN or SUPER_ADMIN |
| POST | `/api/admin/admins` | SUPER_ADMIN |
| POST | `/api/admin/users/:id/reset-password` | ADMIN or SUPER_ADMIN |
| PATCH | `/api/admin/users/:id/status` | ADMIN or SUPER_ADMIN |
| GET | `/api/owner/properties` | OWNER |
| POST | `/api/owner/tenants` | OWNER |
| GET | `/api/owner/agreements` | OWNER |
| GET | `/api/owner/agreements/:id/download` | OWNER |
| GET | `/api/tenant/notifications` | TENANT |
| POST | `/api/tenant/notifications/read-all` | TENANT |

Production sessions are HTTP-only and `Secure`. Because the current Pages
frontend and Workers API are on different sites, production uses
`SameSite=None`; authenticated browser mutations are additionally restricted to
the configured `FRONTEND_URL` origin. Development keeps a localhost-friendly
cookie policy. Repeated failed logins are throttled by a hashed IP+email key in
D1. Passwords are hashed with PBKDF2-HMAC-SHA256 (100k iterations, random salt)
using Workers Web Crypto.
