# Easy Roster — Phase 2: Database Migrations & API Wiring

Phase 2 takes the Phase 1 schema live: apply the hand-written initial
migration, seed demo data, and wire the REST API surface that the
dashboard and management modules will consume.

## 1. Applying the migration

Two supported paths — pick one per database.

### Option A: `psql` (works today, no Prisma CLI needed)

```bash
# Database must exist first:
createdb easy_roster            # or: docker compose up -d

psql "$DATABASE_URL" -f prisma/migrations/0001_init/migration.sql
```

The migration is idempotent for the seeded attendance codes
(`INSERT … ON CONFLICT DO NOTHING`); the DDL itself should be applied
once per database.

### Option B: `prisma migrate` (recommended going forward)

```bash
npx prisma migrate dev          # dev: creates DB, applies migrations
npx prisma migrate deploy       # production / CI
```

Rules:

- All **new** migrations after `0001_init` must be created with
  `npx prisma migrate dev --name <change>` — never edit `0001_init`
  after it has been applied anywhere.
- If `0001_init` was already applied via `psql` (Option A), baseline it
  so Prisma doesn't try to re-apply it:

  ```bash
  npx prisma migrate resolve --applied 0001_init
  ```

- A `migration_lock.toml` pinning `postgresql` will be added the first
  time `prisma migrate dev` runs; commit it.

### Seed demo data

```bash
npm run db:seed                 # idempotent upserts, [DEMO]-tagged rows
```

## 2. API surface wired in Phase 2

Base URL `/api/v1`. Common envelope `{ success, data, meta }` and error
shape `{ success: false, error: { code, message } }` per `docs/API.md`.
All endpoints require a session cookie (JWT httpOnly) plus the listed
permission; `401` unauthenticated, `403` missing permission.

### Dashboard (contracts already in `docs/API.md`)

| Method | Endpoint | Permission |
|---|---|---|
| GET | `/api/v1/dashboard/summary?sectorId=&siteId=` | `dashboard.view` |
| GET | `/api/v1/dashboard/red-zone?sectorId=&siteId=` | `dashboard.view` |
| GET | `/api/v1/dashboard/trends?days=&sectorId=&siteId=` | `dashboard.view` |

### Organization & workforce (CRUD)

| Method | Endpoints | Permission |
|---|---|---|
| GET/POST | `/api/v1/sectors` | `sectors.view` / `sectors.manage` |
| GET/PATCH/DELETE | `/api/v1/sectors/:id` | `sectors.view` / `sectors.manage` |
| GET/POST | `/api/v1/sites` | `sites.view` / `sites.manage` |
| GET/PATCH/DELETE | `/api/v1/sites/:id` | `sites.view` / `sites.manage` |
| GET/POST | `/api/v1/employees?search=&siteId=&sectorId=&status=` | `employees.view` / `employees.create` |
| GET/PATCH/DELETE | `/api/v1/employees/:id` | `employees.view` / `employees.edit` / `employees.delete` |

`DELETE` on master data performs a **soft delete** (`deletedAt`); hard
delete is never exposed for business history.

### Operations

| Method | Endpoint | Permission |
|---|---|---|
| GET | `/api/v1/attendance?month=YYYY-MM&siteId=` | `attendance.view` |
| PUT | `/api/v1/attendance` (bulk upsert by `employeeId+date`) | `attendance.edit` |
| GET/POST | `/api/v1/rosters` | `rosters.view` / `rosters.manage` |
| POST | `/api/v1/rosters/:id/publish`, `/api/v1/rosters/:id/lock` | `rosters.manage` |
| GET/POST | `/api/v1/shifts` | `shifts.view` / `shifts.manage` |
| GET/PUT | `/api/v1/manpower?siteId=` (requirements; triggers snapshot refresh + `Site.requiredManpower` update) | `manpower.view` / `manpower.manage` |
| GET | `/api/v1/shortage?severity=&siteId=` | `shortage.view` |
| POST | `/api/v1/shortage/:id/acknowledge` | `shortage.manage` |
| GET/POST | `/api/v1/leaves` | `leaves.view` / `leaves.manage` |
| POST | `/api/v1/leaves/:id/approve`, `/api/v1/leaves/:id/reject` | `leaves.approve` |
| GET/POST | `/api/v1/transfers` | `transfers.view` / `transfers.manage` |
| POST | `/api/v1/transfers/:id/approve` (applies the transfer on `effectiveDate`) | `transfers.approve` |
| GET | `/api/v1/notifications`, PATCH `/api/v1/notifications/:id/read` | `notifications.view` |

Reports, analytics, payroll, and AI endpoints land with their phases;
their table contracts are already in the schema.

### Pagination & filtering

List endpoints accept `?page=&pageSize=` (defaults 1 / 25, max 200) and
return `meta: { page, pageSize, total }`. Filtering is server-side;
clients must never pull full tables to filter locally.

## 3. Audit-log-on-mutation rule

Every `POST` / `PUT` / `PATCH` / `DELETE` handler must write one
`AuditLog` row **in the same transaction** as the mutation:

- `userId` — from the session
- `action` — e.g. `employee.update`, `attendance.upsert`, `site.manpower.update`
- `module` — e.g. `employees`, `attendance`, `sites`
- `recordId`, `oldValue`, `newValue` — JSON snapshots (never include
  password hashes or secrets)
- `ip`, `userAgent` — from the request

`AuditLog` is append-only: application code must never `UPDATE` or
`DELETE` audit rows. Read access requires `audit.view`.

## 4. Demo login roles (fullstack app)

The seed creates demo accounts under these roles (demo passwords are
replaced by the real Argon2id flow in the auth phase; never commit real
credentials):

| Role | Scope |
|---|---|
| `SUPER_ADMIN` | Everything, including roles/permissions and audit |
| `ADMIN` | Everything except role/permission management |
| `HR_MANAGER` | Employees, leaves, transfers, payroll data |
| `OPERATIONS_MANAGER` | Sectors, sites, rosters, manpower, shortage |
| `SECTOR_MANAGER` | Own sector's sites, rosters, attendance |
| `SITE_MANAGER` | Own site's roster, attendance, manpower |
| `INSPECTOR` | Read across assigned sectors/sites + shortage ack |
| `SUPERVISOR` | Own shift's attendance marking |
| `PAYROLL` | Payroll-ready attendance data, payroll records |
| `VIEWER` | Read-only dashboards and reports |

Permission keys follow `<module>.<action>` (`employees.view`,
`attendance.edit`, `reports.export`, …); route handlers enforce them via
a `requirePermission('…')` guard. Sector/site scoping is enforced in the
service layer, not just the UI.
