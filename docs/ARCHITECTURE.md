# Easy Roster — System Architecture (Phase 1)

## 1. Overview

Easy Roster is a multi-site workforce management platform. One central
PostgreSQL database models the whole organization as a hierarchy:

```
Company → Sector → Site → Shift → Employee
```

There is exactly one database. Sites and sectors are organizational
entities (rows), never separate databases or schemas.

Design principles:

- **Configurable business rules** — attendance day-values, shortage
  severity thresholds, payroll rules live in the database / Settings,
  never hard-coded in application code.
- **Modular backend** — NestJS-style modules (controller → service →
  repository) implemented as Next.js Route Handlers in Phase 1, so the
  API can be extracted into a standalone NestJS service later without
  rewriting business logic.
- **Strict typing** — TypeScript `strict: true` everywhere; Zod schemas
  validate every API boundary.
- **Security by default** — JWT in httpOnly cookies, RBAC + permission
  checks on every route, audit logging on every mutation.

## 2. Monorepo layout

```
easy-roster/
├── app/                      # Next.js 14 App Router (frontend + API)
│   ├── (dashboard)/          # Dashboard, operations, roster, …
│   ├── api/                  # REST API route handlers (thin controllers)
│   └── [locale]/             # ar / en localized routes (RTL/LTR)
├── modules/                  # Backend domain modules (NestJS-style)
│   ├── dashboard/            #   dashboard.controller.ts (route wiring)
│   │                         #   dashboard.service.ts   (business logic)
│   │                         #   dashboard.repository.ts (Prisma queries)
│   ├── employees/
│   ├── attendance/
│   ├── roster/
│   ├── manpower/
│   ├── shortage/
│   └── …                     # one module per domain, same 3-file shape
├── components/               # React components (shadcn/ui based)
│   ├── ui/                   # shadcn/ui primitives
│   ├── dashboard/            # KPI cards, Red Zone table, charts
│   └── layout/               # Sidebar, TopBar, providers
├── lib/                      # Cross-cutting: auth, prisma client, i18n,
│                             # permissions, api-response envelope, config
├── hooks/                    # TanStack Query hooks per module
├── types/                    # Shared TypeScript types & Zod schemas
├── validations/              # Request/response Zod schemas per module
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── docs/
├── tests/                    # unit / integration / e2e
└── docker-compose.yml
```

Rules:

- Route handlers (`app/api/**`) contain **no business logic** — they
  parse/validate input, call the module service, and format the response.
- Services contain business logic and are framework-agnostic.
- Repositories own Prisma queries (pagination, filtering, indexes).

## 3. Frontend

- **Next.js 14** (App Router, React Server Components where data is
  static, client components for interactivity).
- **Tailwind CSS** + **shadcn/ui** for the design system.
- **TanStack Query** for server state (dashboard polling/SSE, tables);
  **TanStack Table** for data grids; **React Hook Form + Zod** for forms.
- **Recharts** for attendance / manpower / shortage trends.
- **Lucide** icons.

### 3.1 Internationalization (ar / en)

- Route-based locales: `/en/...` (LTR) and `/ar/...` (RTL, `dir="rtl"`),
  `localePrefix: "always"`; default locale `ar` (see `i18n-routing.ts`).
- Implemented with **next-intl** (v3): `middleware.ts` handles locale
  negotiation/redirects (`/` → `/ar`), `i18n.ts` loads dictionaries,
  `app/[locale]/layout.tsx` sets `<html lang dir>` and provides
  `NextIntlClientProvider`.
- Dictionary files `messages/{ar,en}.json`; fonts: system stack with
  Arabic support (Tahoma / Segoe UI / IBM Plex Sans Arabic) — no webfont
  download at build time so `next build` works offline.
- All user-facing strings go through the dictionary — no hard-coded copy.
- `/api/*` routes are locale-free (middleware matcher excludes them).

### 3.2 Theming

- `next-themes` (`class` strategy): Light / Dark / System.
- Charts and tables read CSS variables so they adapt automatically.

## 4. Backend

### 4.1 API style

- REST, JSON, consistent envelope (see `docs/API.md`).
- Versioned prefix: `/api/v1/...` (Phase 1 exposes `/api/...` aliases
  that forward to v1).
- Pagination: `?page=&pageSize=` → `{ data, meta: { page, pageSize,
  total, totalPages } }`.
- Filtering: `?sectorId=&siteId=&status=&from=&to=` — always
  server-side; never load thousands of rows to filter in the browser.

### 4.2 Module shape (example: shortage)

```
modules/shortage/
├── shortage.controller.ts   # wires app/api/v1/shortage/route.ts
├── shortage.service.ts      # severity calc, aggregation, thresholds
├── shortage.repository.ts   # Prisma queries
└── shortage.schema.ts       # Zod input/output schemas
```

### 4.3 Real-time strategy

- **Server-Sent Events** (`/api/v1/stream`) for dashboard KPIs,
  shortage changes, and notifications — simple, HTTP-based, works
  through proxies.
- Upgrade to **WebSocket** only if bidirectional interaction is needed
  (Phase 1 does not need it).
- Polling fallback (TanStack Query `refetchInterval`) for clients
  without SSE.

### 4.4 AI integration

```
Frontend → Backend (/api/v1/ai) → AI Service → DB analytics → AI response
```

- AI API keys live **only** in server-side env vars (`AI_API_KEY`).
- AI never writes to employee/payroll tables; it returns
  DATA → ANALYSIS → PREDICTION → EXPLANATION payloads stored as
  `AIInsight` rows for auditability.

## 5. Authentication & authorization

- **JWT**: short-lived access token (15 min) + rotating refresh token
  (7 days), both in `httpOnly`, `Secure`, `SameSite=Lax` cookies.
- Passwords hashed with **Argon2id** (fallback bcrypt where native
  modules are unavailable). Optional TOTP 2FA for privileged roles.
- **RBAC**: `User → Role → Permission`. Every API route runs
  `requirePermission("attendance.edit")` (or `.view`) before the service.
- Frontend hides UI by permission, but the API is the enforcement point.
- All logins, permission changes, and sensitive mutations → `AuditLog`.

Seed roles: `SUPER_ADMIN, ADMIN, HR_MANAGER, OPERATIONS_MANAGER,
SECTOR_MANAGER, SITE_MANAGER, INSPECTOR, SUPERVISOR, PAYROLL, VIEWER`.

## 6. Config-driven business rules

| Rule | Where it lives |
|---|---|
| Attendance codes & day-values (P=1, PP=2, 12=1.5, 6=0.5, A=0, X=−2, AL/SL=0) | `AttendanceCode` table (admin-editable) |
| Shortage severity (0% Normal, 1–10% Warning, >10% Critical) | Settings table (Phase 2 UI; constants documented in seed until then) |
| Leave types, shift types, employee statuses | Enums + Settings |
| Payroll formulas (overtime, deductions) | `PayrollRecord` + payroll rules config |

`shortage = required − actual`; negative ⇒ `surplus = |shortage|`;
`shortagePct = shortage / required × 100`.

## 7. Security checklist (Phase 1)

- [ ] Argon2id password hashing; no password hashes in API responses
- [ ] JWT in httpOnly cookies; CSRF tokens on mutations
- [ ] Zod validation on every input; Prisma parameterization (no raw SQL
      with interpolation)
- [ ] RBAC + permission check on every route
- [ ] Rate limiting on `/api/v1/auth/*` and global API bucket
- [ ] Security headers (CSP, HSTS, X-Frame-Options) via middleware
- [ ] Secrets only in server env; `NEXT_PUBLIC_*` never holds secrets
- [ ] AuditLog on employee/attendance/site/salary/permission changes
- [ ] XSS: React escaping + sanitized rich text; never `dangerouslySetInnerHTML`
      with user data

## 8. Performance notes

- Target: thousands of employees, dozens of sites.
- DB indexes on all foreign keys and filter columns (see schema).
- Dashboard aggregates via `groupBy` / raw aggregate queries — never
  hydrate full attendance months to count in JS.
- Attendance calendar pages by month+site; virtualized/horizontally
  scrollable on mobile.
- TanStack Query caching + SSE invalidation; `staleTime` tuned per widget.
- Prisma `select` projections on list endpoints (no `SELECT *`).

## 9. Testing strategy

- Unit: attendance `dayValue` aggregation, shortage math, severity
  thresholds (all 8 codes; 28/29/30/31-day months).
- Integration/API: auth, permission matrix, CRUD per module.
- E2E (Playwright): login → dashboard Red Zone → drill into site →
  edit attendance → totals update.

## 10. Deployment

- `docker-compose.yml`: Postgres 16 for local dev.
- Production: Next.js (Node) + managed Postgres; `prisma migrate deploy`
  on release; automated DB backups; structured JSON logs.
- CI: typecheck → lint → unit tests → build → migrate dry-run.
