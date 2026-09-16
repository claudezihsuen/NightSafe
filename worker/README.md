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

A property has many units; a unit reaches its tenant(s) through a lease; an
agent's access is granted through `agent_assignments`. Rent payments key off
`(lease_id, month)` and utility payments off `(unit_id, type, month)`.

## Seeding privileged accounts

ADMIN, OWNER, AGENT, and UNIT_LEADER accounts can be seeded with the helper
script. TENANT accounts use the invitation flow.

```bash
node scripts/create-user.mjs "System Admin" admin@nightsafe.dev ADMIN a-strong-password
node scripts/create-user.mjs "Jane Owner" jane@nightsafe.dev OWNER a-strong-password
node scripts/create-user.mjs "Lee Ward" lee@nightsafe.dev UNIT_LEADER a-strong-password <unit-id>
```

The script prints an `INSERT` statement. Run it against the intended D1
database only after all migrations, including `0009_admin_role.sql`, have been applied.

## Admin account management

Admin users sign in through the normal login page and are routed to `/admin`.
The Admin area can list all NightSafe accounts, generate one-hour password-reset
links, and enable/disable activated accounts. An Admin cannot disable their own
account. Disabling an account also removes its existing sessions.

Password reset reuses NightSafe's one-time invitation mechanism. Only the newest
reset link remains valid. A disabled account may change its password using a reset
link but remains disabled until an Admin enables it.

## Key endpoints

| Method | Path | Auth |
|---|---|---|
| POST | `/api/auth/login` | — |
| POST | `/api/auth/logout` | — |
| GET | `/api/auth/me` | session cookie |
| GET | `/api/auth/invite/:token` | — |
| POST | `/api/auth/activate/:token` | — |
| GET | `/api/admin/users` | ADMIN |
| POST | `/api/admin/users/:id/reset-password` | ADMIN |
| PATCH | `/api/admin/users/:id/status` | ADMIN |
| GET | `/api/owner/properties` | OWNER |
| POST | `/api/owner/tenants` | OWNER |

Production sessions are HTTP-only and `Secure`. Because the current Pages
frontend and Workers API are on different sites, production uses
`SameSite=None`; authenticated browser mutations are additionally restricted to
the configured `FRONTEND_URL` origin. Development keeps a localhost-friendly
cookie policy. Passwords are hashed with PBKDF2-HMAC-SHA256 (100k iterations,
random salt) using Workers Web Crypto.
