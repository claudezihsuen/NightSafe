# NightSafe API (Cloudflare Worker + D1)

Minimal auth backend: login, logout, session check, and tenant invite/activation.

## Setup

```bash
cd worker
npm install
wrangler d1 create nightsafe-db     # copy the returned database_id into wrangler.toml
npm run db:migrate:local            # applies schema.sql
npm run dev                         # runs on http://localhost:8787
```

## Seeding Owner / Agent / Unit Leader accounts

These roles aren't created through the tenant invite flow, so for local dev:

```bash
node scripts/create-user.mjs "Jane Owner" jane@nightsafe.dev OWNER hunter2word
# prints an INSERT statement
wrangler d1 execute nightsafe-db --local --command "<paste the INSERT here>"
```

Tenants are created via `POST /api/auth/invite` (Owner/Agent only), which
returns an activation link — no tenant password is ever set or seen by
Owner/Agent.

## Endpoints

| Method | Path                        | Auth              |
|--------|-----------------------------|--------------------|
| POST   | `/api/auth/login`           | —                  |
| POST   | `/api/auth/logout`          | —                  |
| GET    | `/api/auth/me`               | session cookie     |
| POST   | `/api/auth/invite`          | OWNER or AGENT     |
| GET    | `/api/auth/invite/:token`   | —                  |
| POST   | `/api/auth/activate/:token` | —                  |

Sessions are HTTP-only, `Secure` (outside dev), `SameSite=Lax` cookies —
never localStorage. Passwords are hashed with PBKDF2-HMAC-SHA256
(100k iterations, random salt) via the Workers-native Web Crypto API.
