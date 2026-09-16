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

The staging Worker allows browser requests from the stable Cloudflare Pages branch alias:

`https://development.nightsafe.pages.dev`

Use a `development` branch in the Pages project for that preview. In Cloudflare Pages **Preview** environment variables, set:

`VITE_API_URL=https://nightsafe-staging.claude-zihsuen.workers.dev`

Production Pages must keep its production API setting unchanged.

If the `development` Pages preview has not been created yet, the staging backend can still be deployed and migrated, but browser login testing should wait until that preview URL exists. Do not point staging CORS at the staging Worker itself; `FRONTEND_URL` must be a frontend origin.

## Local commands (optional)

These are equivalent to the GitHub workflow and are only needed on a machine that has the repo checked out:

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
| Environment value | `staging` | `production` |
| Deploy workflow | manual `Deploy Staging Worker` | automatic `Deploy Production Worker` on `main` Worker changes |

Never seed staging by copying production users or production database data. Use clearly labelled test accounts only.
