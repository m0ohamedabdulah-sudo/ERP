# Easy Roster

Enterprise workforce management platform: HR, attendance, roster, shifts,
manpower, shortage, leaves, transfers, payroll-ready attendance data,
reports, analytics, notifications, RBAC, audit logs, and AI insights —
for companies operating multiple sectors, sites, and shifts.

> **Status:** Phases 1–4 complete — architecture, database + migration,
> auth (JWT + RBAC), main layout, dashboard, Attendance, Roster,
> Leave, Transfer, Reports, Analytics, Payroll, AI Insights,
> Security hardening, Final hardening, Testing, Production deployment.
> See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
> [docs/API.md](docs/API.md), [docs/PHASE2.md](docs/PHASE2.md),
> [docs/PHASE3.md](docs/PHASE3.md),
> [docs/PHASE4.md](docs/PHASE4.md),
> [docs/SECURITY.md](docs/SECURITY.md),
> [docs/TESTING.md](docs/TESTING.md), and
> [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14, React 18, TypeScript (strict) |
| Styling | Tailwind CSS, shadcn/ui, Lucide icons |
| Data fetching | TanStack Query, TanStack Table |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| API | Next.js Route Handlers, NestJS-style modules (`modules/`) |
| Database | PostgreSQL 16, Prisma ORM |
| Auth | JWT (httpOnly cookies) + RBAC + permission checks, Argon2id |
| Real-time | Server-Sent Events (dashboard/notifications) |
| i18n | English (LTR) / Arabic (RTL), switchable at runtime |
| Theming | Light / Dark / System |

## Quickstart

```bash
# 1. Clone and enter
git clone <repo-url> easy-roster && cd easy-roster

# 2. Environment
cp .env.example .env
# then edit .env — set DATABASE_URL and JWT_SECRET (see "Env setup")

# 3. Start Postgres
docker compose up -d

# 4. Install, migrate, seed
npm install
npx prisma migrate dev
npm run db:seed

# 5. Run
npm run dev
# → http://localhost:3000
```

The seed creates clearly-marked **demo data**: company "Easy Roster
Demo", sectors "New Cairo Sector" / "Cairo Sector", sites "Zia Mall",
"Bureau 58", "Les Rois", 66 demo employees, shifts, attendance codes,
and a Red Zone (Zia Mall critical, Bureau 58 warning, Les Rois normal).

## Env setup

All configuration lives in `.env` (never commit it). Start from
`.env.example`:

- `DATABASE_URL` — Postgres connection string.
- `JWT_SECRET` — long random string (e.g. `openssl rand -base64 48`).
  **Server-only.**
- `AI_API_KEY` — optional, Phase 16. **Server-only; never expose to the
  frontend.** Only variables prefixed `NEXT_PUBLIC_` are bundled to the
  browser — no secret may ever use that prefix.

## Docker usage

```bash
docker compose up -d        # Postgres 16 on localhost:5432
docker compose down         # stop
docker compose down -v      # stop + delete data volume
```

`docker-compose.yml` also documents the production shape (app + db);
the app container is added in the deployment phase.

## Project structure

```
app/            # Next.js App Router pages + /api route handlers
modules/        # Domain modules: controller → service → repository
components/     # UI (shadcn/ui primitives, dashboard widgets, layout)
lib/            # auth, prisma, i18n, permissions, api envelope
hooks/          # TanStack Query hooks
types/          # shared TS types
validations/    # Zod schemas
prisma/         # schema.prisma, seed.ts
docs/           # ARCHITECTURE.md, API.md
tests/          # unit / integration / e2e
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit + integration tests |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:migrate` | Apply migrations (dev) |
| `npm run db:seed` | Load demo data |
| `npm run db:studio` | Prisma Studio |

## Project phases

1. ✅ Project setup & architecture
2. ✅ Database architecture (+ hand-written `0001_init` migration)
3. ✅ Auth (JWT + RBAC) — architecture & contracts
4. ✅ Main layout (sidebar, top bar, i18n, theming)
5. ✅ Dashboard (KPIs, trends, Red Zone)
6. Sector / Site management
7. Employee management
8. ✅ Attendance
9. ✅ Roster
10. Manpower
11. Shortage
12. ✅ Leaves
13. ✅ Transfers
14. ✅ Reports
15. ✅ Analytics
16. ✅ AI insights
17. Notifications
18. ✅ Testing — executable `src/lib` + Vitest suites (spec §32); see [docs/TESTING.md](docs/TESTING.md)
19. ✅ Security hardening
20. ✅ Production deployment — checklist; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

> **Phase 2 status: ✅ done** — `prisma/migrations/0001_init/migration.sql`
> applied; REST API surface wired. See [docs/PHASE2.md](docs/PHASE2.md).
>
> **Phase 3 status: ✅ done** — Attendance, Roster, Leave, and
> Transfer modules. API contracts in [docs/PHASE3.md](docs/PHASE3.md).

> **Phase 4 status: ✅ done** — Reports, Analytics, Payroll,
> AI Insights, and Security hardening. API contracts in
> [docs/PHASE4.md](docs/PHASE4.md).

> **Final hardening status: ✅ done** — the two Phase 4 gaps are
> closed: production credential authentication (Argon2id, throttling,
> reset flows, TOTP 2FA, session hardening) and paginated/streaming
> PDF export hardening (chunked generation, async job pattern).
> Full specification in [docs/SECURITY.md](docs/SECURITY.md).
> Remaining phases: none — all 20 phases are specified. Notifications
> (17) rides on the existing notification endpoints (docs/PHASE2.md §2);
> integration/E2E tests and the app source land with implementation.

## Security notes

- Passwords: Argon2id (m=65536, t=3, p=4); never returned by any API.
- Every mutation — and every security-relevant event — writes an
  `AuditLog` row.
- Business rules (attendance day-values, shortage thresholds, payroll
  rules) are configurable data, not hard-coded logic.
- Full hardening spec: [docs/SECURITY.md](docs/SECURITY.md)
  (credential auth, sessions, TOTP 2FA, export hardening,
  no-secrets-to-frontend).
