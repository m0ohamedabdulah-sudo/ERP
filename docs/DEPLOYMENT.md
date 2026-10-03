# Easy Roster — Production Deployment

## 1. Environment variables

Copy `.env.example` to `.env` and set every value. Never commit `.env`.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string for Prisma |
| `JWT_SECRET` | ✅ | `openssl rand -base64 48`; server-only |
| `JWT_ACCESS_TTL` | ✅ | e.g. `15m` |
| `JWT_REFRESH_TTL` | ✅ | e.g. `7d` |
| `NEXT_PUBLIC_APP_URL` | ✅ | Public origin, e.g. `https://roster.example.com` |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | ➖ | `en` or `ar` |
| `AI_API_KEY` | ➖ | Server-only; leave empty until AI Insights are enabled |
| `AI_MODEL` | ➖ | Server-only; paired with `AI_API_KEY` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | local dev | Only used by `docker-compose.yml` |

Rule (enforced at boot): no secret may use the `NEXT_PUBLIC_` prefix.

## 2. Postgres provisioning

- Managed Postgres (RDS, Cloud SQL, Supabase, Neon) or self-hosted
  Postgres 16+.
- Create the database and a least-privilege app role; store the
  connection string in `DATABASE_URL`.
- Enable `pgcrypto` (the initial migration creates it if missing —
  needs superuser or the extension pre-created by ops).

## 3. Running migrations

```bash
# First deploy of an existing psql-seeded DB: baseline, then deploy
npx prisma migrate resolve --applied 0001_init   # only if applied via psql
npx prisma migrate deploy                        # production: never `migrate dev`
```

Rules: never edit an applied migration; new changes ship as new
migration files; `migration_lock.toml` is committed.

## 4. Seed strategy

- **First boot / demo:** `npm run db:seed` loads the idempotent
  `[DEMO]`-tagged dataset (company, sectors, sites, 66 employees,
  shifts, attendance codes, sample attendance).
- **Production:** seed only the 8 `AttendanceCode` rows (the migration
  already inserts them `ON CONFLICT DO NOTHING`) and the initial
  `SUPER_ADMIN` user. Do **not** run the demo seed against production
  data — it is clearly tagged and must stay out of prod.

## 5. Reverse proxy + TLS

- Terminate TLS at the proxy (nginx/Caddy/Cloudflare); the app listens
  on localhost only.
- Forward `X-Forwarded-For` for the audit log's IP capture and for
  rate limiting to see real client IPs.
- Set `NEXT_PUBLIC_APP_URL` to the public HTTPS origin; cookies are
  `Secure` + `HttpOnly` + `SameSite=Lax`.

## 6. Backup schedule

- Daily `pg_dump` (retained 30 days) + weekly base backup; store
  off-site, encrypt at rest.
- Test restores quarterly — an untested backup is not a backup.
- Before any migration: snapshot first.

## 7. Log aggregation

- The app emits structured JSON logs (request id, user id, module,
  action, duration, status). Ship to your aggregator (Loki, Datadog,
  CloudWatch).
- Never log: password hashes, TOTP secrets, reset tokens, AI keys,
  session contents. Audit rows (`AuditLog`) are the compliance trail —
  back them up with the database, never delete them.

## 8. Health checks

- `GET /api/v1/health` → `{ success: true, data: { db: "ok", uptime: s } }`
  (add this route with the app source; it must check DB connectivity).
- Container `HEALTHCHECK` on the health endpoint; orchestrator
  readiness/liveness probes on the same path.
- Alert on: 5xx rate, p95 latency, failed logins spike, export-job
  queue depth.

## 9. First-boot steps

1. Set all required env vars; verify the boot env-audit passes.
2. Run migrations (`prisma migrate deploy`); confirm `0001_init` applied.
3. Create the initial SUPER_ADMIN (seed script or admin CLI) and
   **change the demo credentials immediately** — production boot must
   refuse to start with default demo passwords (see `docs/SECURITY.md`).
4. Configure payroll rules (`/api/v1/payroll/rules`) — absence
   deduction, X-day multiplier, overtime rate — before the first
   payroll period.
5. Set AI keys only if AI Insights are enabled; otherwise confirm the
   honest `ai_unconfigured` state.
6. Verify: login, dashboard KPIs, Red Zone, one attendance write
   (audit row appears), one export download.
7. Schedule backups; wire log shipping; confirm health check green.

## 10. Rollback

- App rollback: redeploy the previous image (migrations are
  forward-only; ensure each migration has a documented manual
  reversal before applying).
- Data rollback: restore from the pre-migration snapshot. Never
  hand-edit production rows outside a migration.
