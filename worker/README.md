# NightSafe API (Cloudflare Worker + D1 + R2)

Auth backend (login, logout, session, tenant activation) plus Owner tenant
creation (lease, first rent payment, agreement upload, audit log).

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
- `0002_core_schema.sql` — `properties`, `units`, `agent_assignments`,
  `leases`, `rent_payments`, `utility_payments`, `agreements`,
  `notifications`, `audit_logs`
- `0003_tenant_creation.sql` — adds `users.phone`, renames the tenant's
  "invited but not activated" status from `PENDING` to
  `WAITING_FOR_ACTIVATION`, adds `leases.due_day` and `leases.deposit`
- `0004_agent_management.sql` — adds `INACTIVE` status and `users.created_by`
- `0005_payment_review_tracking.sql` — adds `reviewed_at`/`reviewer_role` to `rent_payments`
- `0006_unit_leader_utilities.sql` — adds `users.unit_id`, same reviewer tracking on `utility_payments`
- `0007_deposits.sql` — adds `leases.deposit_finalized_at` and four new
  tables: `deposit_items`, `deposit_payments`, `deposit_deductions`,
  `deposit_returns`. Entirely separate from `rent_payments`/`utility_payments`
  — no shared columns, no shared table. A deposit is any number of line
  items (custom `type` values need no schema change); `deposit_finalized_at`
  locks item composition but payments/deductions/returns stay recordable
  after finalization. Payment/refund status are computed from these
  records at request time, never stored, so they can't drift.

Key relationships: a property has many units; a unit reaches its tenant(s)
through a lease; an agent's access to a property/unit is granted via
`agent_assignments`; rent payments key off `(lease_id, month)` and utility
payments off `(unit_id, type, month)`, both one row per period; a lease's
deposit is the sum of its `deposit_items`.

## Seeding Owner / Agent / Unit Leader accounts

These roles aren't created through the tenant invite flow, so for local dev:

```bash
node scripts/create-user.mjs "Jane Owner" jane@nightsafe.dev OWNER hunter2word
# prints an INSERT statement — copy the owner's id from it, you'll need it below
wrangler d1 execute nightsafe-db --local --command "<paste the INSERT here>"
```

## Seeding a property + unit

Property/unit management isn't built yet, so the Owner tenant-creation form
needs at least one to exist first:

```bash
node scripts/create-property.mjs <owner-user-id> "Sagewood Residences" "12 Fern Lane" "2B" 1200 > /tmp/property.sql
wrangler d1 execute nightsafe-db --local --file=/tmp/property.sql
```

## Owner tenant creation

`POST /api/owner/tenants` (multipart/form-data, Owner only) creates the
tenant account, lease, first month's rent payment, optional agreement
upload, invitation, and an audit log entry — in one request:

- If `firstMonthRentPaid` is `"true"`, the first rent payment is created as
  `PAYMENT_CONFIRMED`; otherwise `WAITING_PAYMENT`.
- The tenant account starts as `WAITING_FOR_ACTIVATION` until they set a
  password from the invite link — Owner never sets or sees it.
- The agreement file (if provided) is uploaded to the `FILES` R2 bucket
  before the D1 writes, so its key can be referenced in the same batch.

## Endpoints

| Method | Path                        | Auth              |
|--------|-----------------------------|--------------------|
| POST   | `/api/auth/login`           | —                  |
| POST   | `/api/auth/logout`          | —                  |
| GET    | `/api/auth/me`               | session cookie     |
| GET    | `/api/auth/invite/:token`   | —                  |
| POST   | `/api/auth/activate/:token` | —                  |
| GET    | `/api/owner/properties`     | OWNER              |
| POST   | `/api/owner/tenants`        | OWNER              |

Sessions are HTTP-only, `Secure` (outside dev), `SameSite=Lax` cookies —
never localStorage. Passwords are hashed with PBKDF2-HMAC-SHA256
(100k iterations, random salt) via the Workers-native Web Crypto API.
