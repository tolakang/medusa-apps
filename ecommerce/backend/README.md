# ecommerce / backend

Medusa **2.21.1** backend for the ecommerce business project. One image, deployed twice (server + worker). Standard: `BUILD_PLAN.md` §4.1. Medusa reference: `MEDUSA_SKILL.md`.

**Starter:** `medusajs/dtc-starter` `apps/backend` at commit **`e3a237c9b877`** (2026-09-22, Medusa 2.21.1). Changes from the starter:
- pnpm standalone package: `packageManager`, settings-only `pnpm-workspace.yaml` (hoisting, `allowBuilds`, `tsconfig-paths` override).
- Env-driven `medusa-config.ts`: Redis modules (caching + `@medusajs/caching-redis`, event bus, workflow engine, locking), S3, worker mode, admin, `DATABASE_SSL`.
- `src/migration-scripts/initial-data-seed.ts` moved to `src/scripts/seed-initial-data.ts`. Migration scripts run automatically on every `db:migrate`, so the demo seed must not ship there. Run it by hand with `pnpm seed:initial`.
- Scripts added: `typecheck`, `predeploy` (safe migrate flags), `seed:*`, `--passWithNoTests` on module and unit tests.

## Run locally
```bash
podman compose -f ../docker-compose.local.yml up -d postgres redis   # or docker compose
cp .env.example .env    # then set DATABASE_URL=postgres://medusa:medusa@localhost:55432/ecommerce etc.
pnpm install --frozen-lockfile
pnpm medusa db:migrate --execute-safe-links --execute-safe-search
pnpm dev                                    # http://localhost:9000/app
pnpm medusa user -e admin@example.com -p <password>
pnpm seed:initial                           # optional demo data (EU regions, demo products, publishable key)
```

## Verify (DEV_FLOW §5)
```bash
pnpm build && pnpm typecheck
DB_HOST=localhost DB_PORT=55432 DB_USERNAME=medusa DB_PASSWORD=medusa pnpm test:integration:http
podman build -t ecommerce-backend:check .
```

## Deploy
See `../README.md` (Dokploy). Env: `.env.example`. Keep `DATABASE_SSL=false` for the Dokploy internal Postgres.
