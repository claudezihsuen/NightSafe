# NightSafe — Staging Environment

Staging is isolated from production at the backend layer:

- Worker: `nightsafe-staging`
- D1: `nightsafe-staging-db`
- R2: `nightsafe-staging-files`
- Environment: `ENVIRONMENT=staging`

Production remains `nightsafe-api` + `nightsafe-db` + `nightsafe-files` and is deployed only from the production workflow.

## Deployment

Staging is intentionally **manual** so a normal feature branch cannot mutate a remote database by accident.

In GitHub:

1. Open **Actions**.
2. Select **Deploy Staging Worker**.
3. Choose **Run workflow**.

The workflow uses the same `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets as production, but every Wrangler command includes `--env staging` where required. It runs:

1. dependency installation
2. TypeScript typecheck
3. staging Worker dry-run bundle
4. migrations against `nightsafe-staging-db`
5. deployment of `nightsafe-staging`

No production D1 or R2 binding is referenced by the staging environment block.

## Frontend preview

NightSafe's hosted frontend no longer needs `VITE_API_URL` to choose a remote API. The Cloudflare Pages Function at `/api/*` keeps browser requests same-origin and selects the backend by hostname:

- `https://nightsafe.pages.dev` -> `nightsafe-api`
- `https://development.nightsafe.pages.dev` -> `nightsafe-staging`

Use a `development` Git branch if you want a stable Pages staging preview. Once Cloudflare Pages has produced the `development.nightsafe.pages.dev` branch alias, that preview automatically proxies its `/api/*` calls to the staging Worker; no Preview-scoped API URL is required.

The staging Worker's `FRONTEND_URL` is therefore the Pages preview origin, not the Worker itself. If the `development` Pages preview does not exist yet, backend staging can still be migrated/deployed, but browser login testing should wait until the preview exists.

## Local commands (optional)

Local Vite development still honors `VITE_API_URL`, because localhost does not use the hosted Pages Function proxy.

```bash
cd worker
npm run typecheck
npm run bundle:check:staging
npm run db:migrate:staging:remote
npm run deploy:staging
```

## Safety checklist

| Check | Staging | Production |
|---|---|---|
| Worker | `nightsafe-staging` | `nightsafe-api` |
| D1 | `nightsafe-staging-db` | `nightsafe-db` |
| R2 | `nightsafe-staging-files` | `nightsafe-files` |
| Frontend API route | Pages `/api/*` proxy -> staging | Pages `/api/*` proxy -> production |
| Environment value | `staging` | `production` |
| Deploy workflow | manual `Deploy Staging Worker` | automatic `Deploy Production Worker` on `main` Worker changes |

Never seed staging by copying production users or production database data. Use clearly labelled test accounts only.
