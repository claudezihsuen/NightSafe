# NightSafe — Staging Environment

Staging is fully isolated from production: separate Worker, separate D1
database, separate R2 bucket, separate `ENVIRONMENT` var. No code in
`src/` (rent, utility, deposit, auth logic) changes between environments —
only `wrangler.toml` bindings differ per environment, and the Worker code
reads whichever `env.DB`/`env.FILES`/`env.ENVIRONMENT` it was given.

Production's deploy command (`wrangler deploy`, no flags) is completely
unaffected by anything below — the `[env.staging]` block in `wrangler.toml`
is only used when `--env staging` is explicitly passed.

## One-time setup

```bash
cd worker

# Create the staging D1 database, then paste the returned database_id
# into wrangler.toml under [[env.staging.d1_databases]]
npx wrangler d1 create nightsafe-staging-db

# Create the staging R2 bucket (already referenced by name in wrangler.toml,
# nothing else to configure)
npx wrangler r2 bucket create nightsafe-staging-files

# Apply all migrations to the new staging database
npm run db:migrate:staging:remote
```

Also fill in `FRONTEND_URL` under `[env.staging.vars]` in `wrangler.toml`
once you know your staging frontend's URL (see the Cloudflare Pages step
below) — the Worker's CORS check requires an exact match.

### Seeding a staging-only Owner account

Do not copy any real production account. Seed a clearly-labeled test
account directly into the staging database, reusing the existing script:

```bash
node scripts/create-user.mjs "Staging Owner" owner@staging.nightsafe.test OWNER hunter2word \
  > /tmp/staging-seed.sql
npx wrangler d1 execute nightsafe-staging-db --env staging --remote --file=/tmp/staging-seed.sql
```

## Deploying

```bash
# Backend — deploys to the separate "nightsafe-staging" Worker
cd worker
npm run deploy:staging

# Frontend — builds using .env.staging's VITE_API_URL
cd ..
npm run build:staging
```

The frontend build step only matters if you're deploying the `dist/`
output manually. If staging frontend deploys happen through Cloudflare
Pages' Git integration (recommended — see below), Pages handles the build
itself using whatever environment variables you configure there, and
`.env.staging` in the repo is only used for local `npm run build:staging`
testing.

## Recommended Cloudflare Dashboard setup (manual — not doable from a config file)

Worker (Workers Builds): your `nightsafe-api` Worker project, Settings,
Builds. Leave the existing production "Deploy command" as
`npx wrangler deploy` (unchanged). Add a "Non-production branch deploy
command": `npx wrangler deploy --env staging`. This means pushes to any
branch other than your production branch deploy to the separate staging
Worker automatically, while production's deploy command and branch stay
exactly as they are today.

Frontend (Cloudflare Pages): your Pages project, Settings, Environment
variables. Pages already separates Production and Preview variable scopes
for a single project, no second project needed:
- Production scope: leave `VITE_API_URL` exactly as it is today (unchanged)
- Preview scope: add `VITE_API_URL` set to your staging Worker's URL (from
  `npm run deploy:staging`'s output, e.g.
  `https://nightsafe-staging.<subdomain>.workers.dev`)

Any push to a non-production branch (e.g. `development`) then automatically
gets its own `*.pages.dev` preview URL, built with the Preview-scoped env
vars, i.e. pointed at the staging Worker.

## GitHub branches

Recommended: `main` = production (already your production branch, leave
as-is), `development` = staging. Create the `development` branch from
`main` if it doesn't already exist. No existing branch is renamed or
deleted by anything in this setup.

## Safety checklist

| Check | Result |
|---|---|
| Staging Worker != Production Worker | `nightsafe-staging` vs `nightsafe-api`, different `name`, different deployment |
| Staging D1 != Production D1 | `nightsafe-staging-db` vs `nightsafe-db`, different `database_id` |
| Staging R2 != Production R2 | `nightsafe-staging-files` vs `nightsafe-files` |
| Staging API != Production API | Separate Worker URL entirely |
| Staging DB op can't touch production data | Different `database_id` bound under `env.staging` only |
| Staging file upload can't write to production R2 | Different bucket bound under `env.staging` only |
| Production deploy command unaffected | `wrangler deploy` (no flags) only ever reads the untouched top-level config |
