# Easy Roster — Phase 4: Reports, Analytics, Payroll, AI Insights, Security

Phase 4 adds the decision-support layer (reports, analytics), the
payroll-ready computation module, the AI insights service, and the
security hardening pass. All endpoints live under `/api/v1`, use the
common envelope `{ success, data, meta }` / error shape from
`docs/API.md`, require a session cookie plus the listed permission
(`401` / `403`), and every mutation **and every export** writes an
`AuditLog` row in the same transaction (see `docs/PHASE2.md` §3).
List endpoints paginate with `?page=&pageSize=` (defaults 1 / 25,
max 200).

Permission keys follow `<module>.<action>` and are enforced via
`requirePermission('…')`; sector/site scoping is enforced in the
service layer.

## 1. Reports

One parameterized endpoint serves all thirteen report types. Report
data is computed server-side from live tables — never assembled in
the browser.

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET | `/api/v1/reports/:type` | `reports.view` | `:type` in the list below; JSON by default |
| GET | `/api/v1/reports/:type?format=pdf\|xlsx\|csv` | `reports.export` | File download via `Content-Disposition: attachment`; writes an audit row (`report.export`) |
| GET | `/api/v1/reports/:type?format=print` | `reports.view` | Print-optimized HTML (print CSS, no nav chrome) |

**Report types** (`:type`):

`daily-attendance`, `monthly-attendance`, `employee`,
`site-manpower`, `sector-manpower`, `shortage`, `new-hires`,
`leaving`, `transfers`, `leave`, `payroll-attendance`, `insurance`,
`site-performance`

**Query filters** (all optional, combined with AND):

`from` / `to` (YYYY-MM-DD), `sectorId`, `siteId`, `employeeId`,
`shiftId`, `status`

Unknown `:type` → 404; invalid filter combination → 422. Generation
is synchronous for on-screen/CSV/print output; `pdf`/`xlsx` for
large ranges stream the file. Every export records `type`, filters,
`format`, and row count in the audit row.

## 2. Analytics

Metric endpoints return chart-ready series plus the computed
headline values. All metrics are derived from real database data.

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET | `/api/v1/analytics/:metric` | `analytics.view` | `:metric` in the list below; scoping via query |

**Metrics** (`:metric`): `attendance-rate`, `absence-rate`,
`shortage-rate`, `turnover`, `hires-vs-exits`, `utilization`,
`site-comparison`, `sector-comparison`

**Scoping:** `from` / `to` (YYYY-MM-DD), `sectorId`, `siteId`.
Response shape: `{ metric, scope, value, series: [{ label, value }] }`.

**Metric definitions** (computed in the service layer, shared with
the dashboard where they overlap):

- `attendance-rate` — Σ `AttendanceCode.dayValue` ÷ expected
  person-days in range.
- `absence-rate` — 1 − attendance-rate.
- `shortage-rate` — Σ shortage ÷ Σ required manpower across
  snapshots in range.
- `turnover` — exits (resigned/terminated/excluded) ÷ average active
  headcount in range.
- `hires-vs-exits` — monthly hires vs exits series.
- `utilization` — actual ÷ required manpower per site/shift.
- `site-comparison` / `sector-comparison` — ranked table of the
  above per site / sector.

## 3. Payroll

Payroll is **payroll-ready attendance computation only** — not an
accounting system. Periods lock the computed lines; rules are
configurable data, never code constants.

Period lifecycle: `DRAFT` → `APPROVED` (locked; corrections require a
new period or a privileged adjustment with an audit row).

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET/POST | `/api/v1/payroll/periods` | `payroll.view` / `payroll.manage` | POST `{ month, year }` → DRAFT; computes lines on creation |
| GET | `/api/v1/payroll/periods/:id` | `payroll.view` | Header + line items (below) |
| POST | `/api/v1/payroll/periods/:id/approve` | `payroll.manage` | DRAFT → APPROVED; locked afterwards |
| GET | `/api/v1/payroll/periods/:id/export?format=csv` | `payroll.manage` | CSV download; audit row |
| GET/PUT | `/api/v1/payroll/rules` | `payroll.view` / `payroll.manage` | Configurable rule set (below) |

**Line item fields:** `employee`, `basicSalary`, `attendanceDays`,
`totalP`, `absences`, `xDays`, `leaveDays`, `overtime`, `deductions`,
`advances`, `netPay`.

**Computation rules** (defaults; each overridable via
`/api/v1/payroll/rules`):

- `attendanceDays` = `totalP` from the attendance summary
  (`docs/PHASE3.md` §1).
- `xDays` counts X-coded days; deduction = `xDays × xDayMultiplier`
  (`xDayMultiplier` default 2, configurable).
- `absences` (A-coded days) deduct `absenceDeduction` per day
  (configurable: fixed amount or fraction of daily rate).
- `overtime` hours × `overtimeRate` (configurable).
- `netPay` = `basicSalary` + overtime pay − absence deductions −
  X deductions − leave-without-pay − `advances` + adjustments.
- `AL`/`SL` days are paid per policy flags in the rules; unpaid
  leave types deduct the daily rate.

Recomputing a DRAFT period re-runs the rules in one transaction;
`APPROVED` periods reject recomputation with 409.

## 4. AI Insights

The AI service is a **read-only analysis layer**: backend →
AI provider → database analytics → response. AI never writes to
employee, attendance, payroll, or any business table — enforced by
giving the AI service no write permissions and no mutation
endpoints.

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET | `/api/v1/ai/insights?type=` | `ai.view` | `type` in the list below; `from`/`to`/`siteId` scoping |
| GET/PUT | `/api/v1/ai/config` | `ai.view` / `ai.configure` | Provider, model, enabled insight types |

**Insight types** (`type`): `daily-summary`, `shortage-analysis`,
`attendance-anomalies`, `staffing-prediction`, `report-summary`.

**Response shape** (every insight): `data` → `analysis` →
`prediction` → `explanation`. The `data` section cites the concrete
figures the conclusion rests on (site, required/actual/shortage,
dates); `explanation` is a plain-language trend narrative.

**Hard rules:**

- API keys live **only** in server-side environment variables
  (`AI_API_KEY`, `AI_MODEL`). They are never prefixed
  `NEXT_PUBLIC_`, never bundled to the browser, never returned by
  any endpoint, and never written to logs or audit rows.
- When no key is configured, the endpoints return an honest
  `unconfigured` state (`success: false`, `error.code:
  "ai_unconfigured"`) with setup guidance — never a fabricated
  insight.
- AI output is advisory: staffing recommendations and risk flags
  are presented for human decision; applying them (transfers,
  hires, roster changes) always goes through the normal
  permission-checked mutations.

## 5. Security hardening

### Rate limiting

Enforced per IP + session at the API gateway layer; `429` responses
carry `Retry-After`.

| Scope | Limit |
|---|---|
| Auth endpoints (`/api/v1/auth/*`) | 10 req/min per IP |
| General API | 300 req/min per session |
| Export endpoints (`reports`, `payroll/.../export`, `rosters/.../export`) | 10 req/min per session |
| AI insight endpoints | 30 req/min per session |

### TOTP two-factor authentication

| Method | Endpoint | Notes |
|---|---|---|
| POST | `/api/v1/auth/2fa/setup` | Authenticated; returns `otpauth://` URI + QR payload **once**; the secret is stored encrypted and never returned again |
| POST | `/api/v1/auth/2fa/verify` | `{ code }` → enables 2FA, returns one-time backup codes (hashed at rest) |
| POST | `/api/v1/auth/2fa/disable` | Requires `{ password, code }`; writes an audit row |

Login flow with 2FA enabled: valid password → `2fa_required`
challenge (short-lived token, no session) → valid TOTP code →
session cookie issued. Backup codes are single-use.

### No-secrets-to-frontend guarantee

- Only variables prefixed `NEXT_PUBLIC_` reach the browser; no
  secret (JWT keys, `AI_API_KEY`, 2FA secrets, password hashes,
  backup codes) may ever use that prefix — enforced by a startup
  env audit that fails boot on violation.
- API serializers exclude `passwordHash`, `twoFactorSecret`, and
  internal fields by default; audit rows never contain secrets.
- CSRF protection on cookie-authenticated mutations; secure,
  httpOnly, SameSite cookies; Argon2id password hashing.

## 6. Cross-cutting notes

- **Exports and AI insight requests** write audit rows like any
  mutation (`report.export`, `payroll.export`, `ai.insight.request`).
- **Notifications**: approved payroll periods, critical AI risk
  flags, and completed report exports emit in-app notifications.
- **Next phases**: Testing (18) covers the new computation paths
  (payroll math, metric definitions, report filters); Production
  deployment (20) adds the app container, automated backups, and
  CI/CD.
