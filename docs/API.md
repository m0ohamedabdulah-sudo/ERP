# Easy Roster — API Contract (Phase 1: Dashboard)

Base URL: `/api/v1`. All responses use JSON with a common envelope.

## Conventions

### Envelope

```json
{
  "success": true,
  "data": {},
  "meta": { "generatedAt": "2026-09-27T19:30:00.000Z", "demoData": true }
}
```

Errors:

```json
{
  "success": false,
  "error": { "code": "FORBIDDEN", "message": "Missing permission: dashboard.view" }
}
```

### Auth

All dashboard endpoints require an authenticated session (JWT httpOnly
cookie) and the `dashboard.view` permission. `401` when unauthenticated,
`403` when the permission is missing.

### Common query params

| Param | Type | Description |
|---|---|---|
| `sectorId` | uuid | Filter to one sector |
| `siteId` | uuid | Filter to one site |
| `from` / `to` | `YYYY-MM-DD` | Date range (trends) |
| `days` | int (default 14, max 90) | Trend window length |

---

## GET /api/dashboard/summary

Headline KPI cards for the dashboard.

**Response `200`:**

```json
{
  "success": true,
  "data": {
    "employees": {
      "total": 66,
      "active": 65,
      "presentToday": 60,
      "absentToday": 3,
      "onAnnualLeave": 2,
      "onSickLeave": 1,
      "newHiresThisMonth": 3,
      "leavingThisMonth": 1
    },
    "sites": { "total": 3, "active": 3 },
    "manpower": {
      "required": 75,
      "actual": 66,
      "shortage": 9,
      "surplus": 0,
      "shortagePercentage": 12.0
    }
  },
  "meta": { "generatedAt": "2026-09-27T19:30:00.000Z", "demoData": true }
}
```

Notes:

- `presentToday` counts attendance rows with a code where
  `countsAsPresent = true`; `absentToday` counts the rest (A/X).
- `newHiresThisMonth`: `hiringDate` within the calendar month.
- `leavingThisMonth`: `lastWorkingDay` within the calendar month and
  status in (RESIGNED, TERMINATED, EXCLUDED, BLACKLISTED).
- Manpower totals aggregate today's `ManpowerSnapshot` rows
  (optionally filtered by `sectorId`/`siteId`).

---

## GET /api/dashboard/red-zone

Sites ordered by severity (CRITICAL → WARNING → NORMAL), with per-shift
breakdown for drill-down.

**Response `200`:**

```json
{
  "success": true,
  "data": [
    {
      "siteId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "siteName": "Zia Mall",
      "sectorName": "New Cairo Sector",
      "required": 25,
      "actual": 18,
      "shortage": 7,
      "surplus": 0,
      "shortagePercentage": 28.0,
      "severity": "CRITICAL",
      "shifts": [
        { "shiftId": "…", "shiftName": "Morning", "required": 10, "actual": 7, "shortage": 3, "shortagePercentage": 30.0, "severity": "CRITICAL" },
        { "shiftId": "…", "shiftName": "Evening", "required": 8, "actual": 6, "shortage": 2, "shortagePercentage": 25.0, "severity": "CRITICAL" },
        { "shiftId": "…", "shiftName": "Night", "required": 7, "actual": 5, "shortage": 2, "shortagePercentage": 28.57, "severity": "CRITICAL" }
      ]
    },
    {
      "siteId": "…",
      "siteName": "Bureau 58",
      "sectorName": "New Cairo Sector",
      "required": 20,
      "actual": 18,
      "shortage": 2,
      "surplus": 0,
      "shortagePercentage": 10.0,
      "severity": "WARNING",
      "shifts": [
        { "shiftName": "Morning", "required": 8, "actual": 7, "shortage": 1, "shortagePercentage": 12.5, "severity": "CRITICAL" },
        { "shiftName": "Evening", "required": 7, "actual": 6, "shortage": 1, "shortagePercentage": 14.29, "severity": "CRITICAL" },
        { "shiftName": "Night", "required": 5, "actual": 5, "shortage": 0, "shortagePercentage": 0.0, "severity": "NORMAL" }
      ]
    },
    {
      "siteId": "…",
      "siteName": "Les Rois",
      "sectorName": "Cairo Sector",
      "required": 30,
      "actual": 30,
      "shortage": 0,
      "surplus": 0,
      "shortagePercentage": 0.0,
      "severity": "NORMAL",
      "shifts": [
        { "shiftName": "Morning", "required": 12, "actual": 12, "shortage": 0, "shortagePercentage": 0.0, "severity": "NORMAL" },
        { "shiftName": "Evening", "required": 10, "actual": 10, "shortage": 0, "shortagePercentage": 0.0, "severity": "NORMAL" },
        { "shiftName": "Night", "required": 8, "actual": 8, "shortage": 0, "shortagePercentage": 0.0, "severity": "NORMAL" }
      ]
    }
  ],
  "meta": {
    "generatedAt": "2026-09-27T19:30:00.000Z",
    "demoData": true,
    "thresholds": { "warningMaxPct": 10, "criticalAbovePct": 10, "note": "Configurable per company (Settings); values shown are demo defaults." }
  }
}
```

Severity rule (demo defaults, configurable): `0%` → NORMAL,
`1–10%` → WARNING, `>10%` → CRITICAL.

---

## GET /api/dashboard/trends

Time series for the dashboard charts.

**Query:** `?days=14` (default), optional `sectorId`, `siteId`.

**Response `200`:**

```json
{
  "success": true,
  "data": {
    "range": { "from": "2026-09-14", "to": "2026-09-27", "days": 14 },
    "series": [
      {
        "date": "2026-09-14",
        "attendanceRate": 96.4,
        "absenceRate": 3.6,
        "requiredManpower": 75,
        "actualManpower": 68,
        "shortage": 7,
        "shortagePercentage": 9.33,
        "newHires": 0,
        "exits": 0
      },
      {
        "date": "2026-09-27",
        "attendanceRate": 94.1,
        "absenceRate": 5.9,
        "requiredManpower": 75,
        "actualManpower": 66,
        "shortage": 9,
        "shortagePercentage": 12.0,
        "newHires": 1,
        "exits": 0
      }
    ]
  },
  "meta": { "generatedAt": "2026-09-27T19:30:00.000Z", "demoData": true }
}
```

Notes:

- `attendanceRate` = present-marked employees ÷ employees expected that
  day × 100, using each code's `countsAsPresent` flag (configurable).
- Days without snapshot data are backfilled from the latest snapshot on
  or before that date; missing days are omitted, never fabricated.
- `newHires` / `exits` count `hiringDate` / `lastWorkingDay` per day.

---

## Future endpoints (Phase 2+)

```
GET    /api/v1/sectors            POST   /api/v1/sectors
GET    /api/v1/sites              POST   /api/v1/sites
GET    /api/v1/employees          POST   /api/v1/employees
GET    /api/v1/attendance?month=  PUT    /api/v1/attendance
GET    /api/v1/rosters            POST   /api/v1/rosters/:id/publish
GET    /api/v1/manpower           GET    /api/v1/shortage
GET    /api/v1/leaves             POST   /api/v1/transfers
GET    /api/v1/reports/:type      GET    /api/v1/analytics/overview
GET    /api/v1/notifications      POST   /api/v1/ai/insights
```

Full contracts for these will be added as each phase lands.

---

# Security ERP — Phase 1: Clients / Contracts / Billing

All endpoints below require authentication (see `lib/auth.ts`; until the
JWT session module lands, local dev uses `ALLOW_DEV_ACTOR=true` with the
`x-dev-actor: <ROLE>` header) and the listed permission, and they use the
same envelope as above. Mutations write `AuditLog` rows.

Permissions (seeded): `clients.view/create/edit/delete`,
`contracts.view/create/edit/delete`, `invoices.view/create/manage`,
`payments.view/create`.

Money is serialized as JSON numbers (Prisma `Decimal` → number at the
DTO boundary). Dates are ISO-8601 strings; date-only fields accept and
return `YYYY-MM-DD`.

## Clients

### GET /api/v1/clients — `clients.view`
Query: `?page=&pageSize=&search=&status=` (`search` matches Arabic /
English company name, tax ID, commercial registration).

### POST /api/v1/clients — `clients.create`
Body: `{ companyNameAr, companyNameEn, taxId?, commercialReg?, address?,
phone?, email?, status?, notes?, contacts?: [{ name, role?, phone?,
email?, isPrimary? }] }` (max 20 contacts). → `201`.

### GET /api/v1/clients/:id — `clients.view`
Client with contacts.

### PUT /api/v1/clients/:id — `clients.edit`
Partial update (contacts are managed separately, not here).

### DELETE /api/v1/clients/:id — `clients.delete`
`409 CLIENT_HAS_CONTRACTS` when contracts reference the client.

## Contracts

### GET /api/v1/contracts — `contracts.view`
Query: `?page=&pageSize=&search=&status=&clientId=`.

### POST /api/v1/contracts — `contracts.create`
Body:
```json
{
  "clientId": "uuid",
  "contractNo": "CNT-2026-014",
  "titleAr": "…", "titleEn": "…",
  "startDate": "2026-01-01", "endDate": "2026-12-31",
  "paymentTermsDays": 30,
  "penaltyClause": "…", "sla": "…", "notes": "…",
  "sites": [
    {
      "siteId": "uuid",
      "serviceType": "STATIC_GUARD",
      "rates": [
        {
          "shiftId": "uuid|null", "positionId": "uuid|null",
          "ratePerShift": 300, "ratePerMonth": null,
          "overtimeRatePerHour": 50,
          "effectiveFrom": "2026-01-01", "effectiveTo": null
        }
      ]
    }
  ]
}
```
`serviceType`: `STATIC_GUARD | BODYGUARD | EVENT_SECURITY | PATROL |
CCTV_MONITORING`. A `null` `shiftId`/`positionId` means the rate applies
to all shifts/positions of the site. `409 CONTRACT_NO_EXISTS` on
duplicate `contractNo`.

### GET /api/v1/contracts/:id — `contracts.view`
Full detail: client, sites (with site + per-rate shift/position).

### PUT /api/v1/contracts/:id — `contracts.edit`
`DRAFT` contracts: all fields editable. `ACTIVE` and beyond: only
`notes`, `sla`, `penaltyClause`, `paymentTermsDays` (`409
CONTRACT_LOCKED` otherwise; date changes on `ACTIVE` re-run the overlap
check).

### DELETE /api/v1/contracts/:id — `contracts.delete`
`DRAFT` only and only when no invoices exist.

### POST /api/v1/contracts/:id/status — `contracts.edit`
Body: `{ "to": "ACTIVE" | "SUSPENDED" | "EXPIRED" | "TERMINATED" }`.
Lifecycle: `DRAFT → ACTIVE → SUSPENDED ⇄ ACTIVE → EXPIRED`;
`TERMINATED` from `DRAFT`/`ACTIVE`/`SUSPENDED`. Activating requires ≥1
site, ≥1 rate, valid dates, and **no overlapping ACTIVE contract on a
shared site** (`409 CONTRACT_SITE_CONFLICT` with details).

### POST /api/v1/contracts/:id/sites — `contracts.create`
Add a site line (body: one `contractSiteInput`). `DRAFT` only.

### DELETE /api/v1/contracts/sites/:contractSiteId — `contracts.edit`
Remove a site line (rates cascade). `DRAFT` only.

### POST /api/v1/contracts/sites/:contractSiteId/rates — `contracts.create`
Add a rate. `DRAFT` only.

### DELETE /api/v1/contracts/rates/:rateId — `contracts.edit`
Remove a rate. `DRAFT` only.

### POST /api/v1/contracts/refresh-expiry — `contracts.edit`
System sweep: `ACTIVE` contracts with `endDate < today` → `EXPIRED`.
Returns `{ updated }`.

## Billing

### POST /api/v1/invoices — `invoices.create` (generate draft)
Body: `{ contractId, periodStart: "YYYY-MM-DD", periodEnd: "YYYY-MM-DD",
taxRate?: 0–1 (default 0), discountAmount? (default 0) }`.

The contract must be `ACTIVE` and the period must lie inside the
contract dates. Present attendance days (`countsAsPresent = true`) at
the contract's sites are grouped per (site, shift, rate); the most
specific effective rate wins (shift+position > shift > generic). Days
with no effective rate abort generation with `422 UNPRICED_ATTENDANCE`
(they are reported, never silently dropped). Totals: discount first,
then tax on the net. Invoice numbers come from the `Sequence` table:
`INV-2026-0001`. → `201` with the draft (status `DRAFT`).

### GET /api/v1/invoices — `invoices.view`
Query: `?page=&pageSize=&clientId=&contractId=&status=&from=&to=`
(`from`/`to` filter `periodStart`).

### GET /api/v1/invoices/:id — `invoices.view`
Detail with lines, payments, `paidTotal`, `remaining`; overdue status is
auto-synced on read.

### POST /api/v1/invoices/:id/recalculate — `invoices.manage`
`DRAFT` only: rebuild lines/totals from current attendance + rates
(keeps `invoiceNo`).

### POST /api/v1/invoices/:id/transition — `invoices.manage`
Body: `{ "transition": "issue" | "send" | "cancel" }`.
`issue`: `DRAFT → ISSUED`, sets `issuedAt` and `dueDate = issuedAt +
paymentTermsDays`. `send`: `ISSUED → SENT`. `cancel`: `DRAFT →
CANCELLED` (and `ISSUED → CANCELLED` when no payments exist).

### GET /api/v1/invoices/:id/payments — `payments.view`
### POST /api/v1/invoices/:id/payments — `payments.create`
Body: `{ amount, paidAt: "YYYY-MM-DD", method: CASH | BANK_TRANSFER |
CHECK | ELECTRONIC, reference?, notes? }`. Rejects overpayment (`409
OVERPAYMENT`) and payment on `DRAFT`/`CANCELLED`/`PAID`. Payment numbers:
`PAY-2026-0001`. Status auto-updates to `PARTIALLY_PAID` / `PAID`.

### POST /api/v1/invoices/:id/einvoice — `invoices.manage`
E-invoice submission **stub**: records an `EinvoiceSubmission` row with
status `PENDING`. No external ETA call is made (integration pending).

### POST /api/v1/invoices/refresh-overdue — `invoices.manage`
Marks `ISSUED`/`SENT`/`PARTIALLY_PAID` invoices past `dueDate` as
`OVERDUE`. Returns `{ updated }`.

### Error codes (Phase 1)
`UNAUTHENTICATED 401`, `FORBIDDEN 403`, `VALIDATION_ERROR 422`,
`NOT_FOUND 404`, `CLIENT_HAS_CONTRACTS 409`, `CONTRACT_NO_EXISTS 409`,
`CONTRACT_LOCKED 409`, `CONTRACT_SITE_CONFLICT 409`,
`INVOICE_CONTRACT_NOT_ACTIVE 409`, `UNPRICED_ATTENDANCE 422`,
`OVERPAYMENT 409`, `INVALID_TRANSITION 400`.
## Recruitment

Job-applicant pipeline: NEW → SCREENING → INTERVIEW →
MEDICAL_SECURITY_CHECK → APPROVED → (hire action) → HIRED, or REJECTED
at any stage. HIRED is only reachable through the hire action; the
status endpoint rejects transitions to HIRED. Approving a candidate
requires at least one PASSED interview.

Pipeline stages (in order): `NEW`, `SCREENING`, `INTERVIEW`,
`MEDICAL_SECURITY_CHECK`, `APPROVED`, `REJECTED`, `HIRED`.

Permissions: `recruitment.view`, `recruitment.create`, `recruitment.edit`,
`recruitment.delete`, `recruitment.hire`. Overriding a compliance block
at hire additionally requires `compliance.override`.

### List candidates

`GET /api/v1/candidates?page=&pageSize=&search=&status=&siteId=`

Paginated list of candidate summaries (`recruitment.view`). `search`
matches nameAr, nameEn, nationalId, phone.

```json
{ "success": true, "data": [ { "id": "…", "nameAr": "أحمد", "nameEn": "Ahmed",
  "nationalId": "29001011234567", "status": "NEW",
  "desiredPositionCode": "GUARD", "desiredSiteName": "Zia Mall",
  "interviewCount": 1, "appliedAt": "2026-09-29T00:00:00.000Z" } ],
  "meta": { "page": 1, "pageSize": 20, "total": 5, "totalPages": 1 } }
```

### Pipeline board

`GET /api/v1/candidates/pipeline` (`recruitment.view`) — all seven
stages, each with a count and candidate summaries:

```json
{ "success": true, "data": [ { "status": "NEW", "count": 1,
  "candidates": [ /* summaries */ ] }, … ] }
```

### Get candidate

`GET /api/v1/candidates/:id` (`recruitment.view`) — full detail with
interviews and collected documents.

### Create candidate

`POST /api/v1/candidates` (`recruitment.create`, 201)

```json
{ "nameAr": "أحمد محمد", "nameEn": "Ahmed Mohamed",
  "nationalId": "29001011234567", "phone": "01012345678",
  "birthDate": "1990-01-01", "militaryStatus": "COMPLETED",
  "desiredPositionId": "…", "desiredSiteId": "…", "source": "WALK_IN" }
```

`nationalId` must be 14 digits, unique (`409 CANDIDATE_EXISTS` on
duplicate). `phone` must be an Egyptian mobile (`01xxxxxxxxx`).

### Update candidate

`PATCH /api/v1/candidates/:id` (`recruitment.edit`) — partial update.
HIRED candidates are locked (`409 CANDIDATE_HIRED`).

### Delete candidate

`DELETE /api/v1/candidates/:id` (`recruitment.delete`) — blocked for
HIRED candidates with a linked employee (`409 CANDIDATE_HIRED`).

### Transition status

`POST /api/v1/candidates/:id/status` (`recruitment.edit`)

```json
{ "to": "SCREENING" }
```

Illegal transitions → `422 INVALID_TRANSITION`. Approving without a
PASSED interview → `422 APPROVAL_BLOCKED`. Transitioning to HIRED
directly → `422` (use the hire action).

### List interviews

`GET /api/v1/candidates/:id/interviews` (`recruitment.view`)

### Schedule interview

`POST /api/v1/candidates/:id/interviews` (`recruitment.edit`, 201)

```json
{ "scheduledAt": "2026-10-05T10:00:00+02:00",
  "interviewerId": "…", "location": "Head office", "notes": "…" }
```

`scheduledAt` must be in the future. Blocked for REJECTED/HIRED
candidates (`422 INVALID_CANDIDATE_STATUS`).

### Update / delete interview

`PATCH /api/v1/candidates/interviews/:interviewId` (`recruitment.edit`) —
set `result` (`PENDING|PASSED|FAILED|NO_SHOW`), `score` (0–100),
reschedule, or edit notes.

`DELETE /api/v1/candidates/interviews/:interviewId` (`recruitment.edit`).

### Hire candidate

`POST /api/v1/candidates/:id/hire` (`recruitment.hire`, 201)

```json
{ "siteId": "…", "shiftId": "…", "salary": 8000,
  "overrideCompliance": false }
```

All fields optional: `siteId` falls back to the candidate's desired
site; `shiftId`/`salary` may be left null; `overrideCompliance` defaults
to `false`.

The hire action, in one transaction:

1. Candidate must be APPROVED (`422 INVALID_CANDIDATE_STATUS` otherwise).
2. Compliance check: missing/expired required documents block the hire
   (`422 COMPLIANCE_BLOCKED`, with `issues` in error details). With
   `overrideCompliance: true` the hire proceeds but requires the
   `compliance.override` permission (`403 FORBIDDEN` otherwise) and the
   override is audit-logged with the issues.
3. Site resolves (input `siteId` or desired site; `422 SITE_REQUIRED`
   when none); sector is taken from the site.
4. The nationalId must not already belong to an employee
   (`409 DUPLICATE_NATIONAL_ID`).
5. Employee is created with card number `EMP-<year>-<seq>` (shared
   numbering sequence), `hiringDate` = today, `status` = ACTIVE, linked
   back to the candidate.
6. Collected candidate documents are transferred to employee documents.
7. Candidate moves to HIRED with `hiredAt`.

```json
{ "success": true, "data": { "employeeId": "…",
  "cardNumber": "EMP-2026-1", "candidateId": "…" } }
```
## Compliance (documents)

Manages required hiring documents (فيش جنائي, work permit, practice license,
…). Document types are admin-configured; `requiredForHire` types drive the
candidate/employee compliance checks. New permissions:
`compliance.view`, `compliance.manage`, `compliance.verify`,
`compliance.override` (override is checked by the recruitment service via
`actor.permissions` when hiring despite compliance issues).

Document status lifecycle: `VALID` → `EXPIRING_SOON` (within 30 days of
expiry) → `EXPIRED`. `MISSING` is derived (required type with no document row)
and never stored. When `expiresAt` is omitted on write, it defaults from
`issuedAt + validityMonths` of the document type (null = never expires).
`fileUrl` is a plain string reference — no storage wiring in this phase.

### GET /api/v1/compliance/document-types — `compliance.view`
List document types. Query: `page`, `pageSize`, `search`, `requiredForHire`.

### POST /api/v1/compliance/document-types — `compliance.manage`
Create a document type.
`409 DOCUMENT_TYPE_CODE_EXISTS` when the code is taken.

### GET /api/v1/compliance/document-types/:id — `compliance.view`

### PATCH /api/v1/compliance/document-types/:id — `compliance.manage`
Partial update (nameAr/nameEn, requiredForHire, validityMonths, isRecurring).

### DELETE /api/v1/compliance/document-types/:id — `compliance.manage`
`409 DOCUMENT_TYPE_IN_USE` when candidate/employee documents reference it.

### GET /api/v1/compliance/candidates/:candidateId/documents — `compliance.view`
List a candidate's documents with type details.

### POST /api/v1/compliance/candidates/:candidateId/documents — `compliance.manage`
Upsert (by candidateId + documentTypeId) `{ documentTypeId, documentNo?,
issuedAt?, expiresAt?, fileUrl?, notes? }`.
`404 CANDIDATE_NOT_FOUND`, `404 DOCUMENT_TYPE_NOT_FOUND`.

### PATCH /api/v1/compliance/candidate-documents/:docId — `compliance.manage`
Partial update of a candidate document.
`404 CANDIDATE_DOCUMENT_NOT_FOUND`.

### DELETE /api/v1/compliance/candidate-documents/:docId — `compliance.manage`

### GET /api/v1/compliance/employees/:employeeId/documents — `compliance.view`
Paginated list. Filters: `status` (VALID/EXPIRING_SOON/EXPIRED),
`documentTypeId`, `expiringWithinDays`, `search`.

### POST /api/v1/compliance/employees/:employeeId/documents — `compliance.manage`
Upsert (by employeeId + documentTypeId). The stored `status` is computed
server-side from `expiresAt`.
`404 EMPLOYEE_NOT_FOUND`, `404 DOCUMENT_TYPE_NOT_FOUND`.

### PATCH /api/v1/compliance/employee-documents/:docId — `compliance.manage`
Partial update; `status` is recomputed from the resulting `expiresAt`.
`404 EMPLOYEE_DOCUMENT_NOT_FOUND`.

### DELETE /api/v1/compliance/employee-documents/:docId — `compliance.manage`

### POST /api/v1/compliance/employee-documents/:docId/verify — `compliance.verify`
Mark a document verified; records `verifiedById` (the actor) and
`verifiedAt`. Audit action `compliance.document.verify`.

### GET /api/v1/compliance/employees/:employeeId/summary — `compliance.view`
`{ employeeId, totalRequired, valid, expiringSoon, expired, missing: [...],
completePct }` — `completePct` is the share of required documents that are
`VALID` (0..1).

### GET /api/v1/compliance/sites/:siteId/summary — `compliance.view`
Site-wide totals `{ totalEmployees, atRiskEmployees, completePct }` plus the
per-employee summaries of employees with expired or missing required
documents.
`404 SITE_NOT_FOUND`.

### POST /api/v1/compliance/sweep — `compliance.manage`
Expiry sweep (run on a schedule): finds employee documents expiring within
30 days (including already-expired), refreshes their stored `status`, and
creates one broadcast `Notification` per document (`DOCUMENT_EXPIRING` /
`DOCUMENT_EXPIRED`, `relatedModule: "compliance"`, `relatedId: employeeId`).
Dedup: skips when an unread notification of the same type for the same
employee was created within the last 7 days.
Returns `{ checked, expiring, expired, notified }`.

Error codes: `DOCUMENT_TYPE_NOT_FOUND`, `DOCUMENT_TYPE_CODE_EXISTS`,
`DOCUMENT_TYPE_IN_USE`, `CANDIDATE_NOT_FOUND`, `CANDIDATE_DOCUMENT_NOT_FOUND`,
`EMPLOYEE_NOT_FOUND`, `EMPLOYEE_DOCUMENT_NOT_FOUND`, `SITE_NOT_FOUND`.
