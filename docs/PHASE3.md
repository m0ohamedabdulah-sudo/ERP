# Easy Roster — Phase 3: Attendance, Roster, Leave, Transfer

Phase 3 builds the four core operations modules on top of the Phase 2
API foundation. All endpoints live under `/api/v1`, use the common
envelope `{ success, data, meta }` / error shape from `docs/API.md`,
require a session cookie plus the listed permission (`401` /
`403`), and every mutation writes an `AuditLog` row in the same
transaction (see `docs/PHASE2.md` §3). List endpoints paginate with
`?page=&pageSize=` (defaults 1 / 25, max 200).

Permission keys follow `<module>.<action>` and are enforced via
`requirePermission('…')`; sector/site scoping is enforced in the
service layer.

## 1. Attendance

Monthly attendance grid; the calendar adapts to 28/29/30/31 days from
`month` + `year`. Codes come from the `AttendanceCode` table (P, PP,
12, 6, A, X, AL, SL) — never hard-coded.

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET | `/api/v1/attendance?siteId=&month=&year=` | `attendance.view` | Grid payload: `employees[]` × `days[]`, each cell `{ code, dayValue }`; `month` = 1–12, `year` = YYYY |
| PUT | `/api/v1/attendance` | `attendance.edit` | Upsert one cell: `{ employeeId, date: YYYY-MM-DD, code }`; validates code exists, employee is active, date in an unlocked period |
| POST | `/api/v1/attendance/bulk` | `attendance.edit` | Bulk ops: `{ op: "mark-all-present" \| "clear-month" \| "copy-previous-month", siteId, month, year }`; runs in one transaction, returns `{ updated, skipped }` |
| GET | `/api/v1/attendance/summary?employeeId=&month=&year=` | `attendance.view` | `{ totalP, perCode: { P: n, PP: n, … } }` per employee (or all employees of the caller's scope when `employeeId` omitted) |

**Day-value computation rule.** `totalP` = Σ `AttendanceCode.dayValue`
over the employee's cells in the month. Defaults: P=1, PP=2, 12=1.5,
6=0.5, A=0, AL=0, SL=0, X=−2. The X value (and all others) is
**configurable** via the `AttendanceCode` table — the service reads
`dayValue`/`countsAsPresent` from the database; no code constants.

Validation: unknown code → 422; editing a date inside a **locked**
roster period → 409; future dates beyond today + configurable grace →
422.

## 2. Roster

Roster lifecycle: `DRAFT` → `PUBLISHED` → `LOCKED`.

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET/POST | `/api/v1/shifts` | `shifts.view` / `shifts.manage` | Shift: name, start/end time, break, requiredStaff, type |
| GET/PATCH/DELETE | `/api/v1/shifts/:id` | `shifts.view` / `shifts.manage` | Soft delete |
| GET/POST | `/api/v1/rosters` | `rosters.view` / `rosters.manage` | Filter `?siteId=&month=&year=&status=` |
| GET/PATCH/DELETE | `/api/v1/rosters/:id` | `rosters.view` / `rosters.manage` | DRAFT only for PATCH/DELETE |
| POST | `/api/v1/rosters/:id/assignments` | `rosters.manage` | Bulk assign: `{ assignments: [{ employeeId, shiftId, date }] }`; upserts per employee+date |
| POST | `/api/v1/rosters/:id/copy` | `rosters.manage` | `{ targetMonth, targetYear, targetSiteId? }` → new DRAFT roster |
| POST | `/api/v1/rosters/:id/publish` | `rosters.publish` | Runs understaffing validation (below); DRAFT → PUBLISHED |
| POST | `/api/v1/rosters/:id/lock` | `rosters.lock` | PUBLISHED → LOCKED |
| GET | `/api/v1/rosters/:id/export` | `rosters.view` | CSV download (`Content-Disposition: attachment`) |

**Lock semantics.** A `LOCKED` roster rejects all assignment and
attendance-affecting mutations with `409`. Unlocking requires
`rosters.lock` and writes an audit row; re-lock after correction.

**Understaffing validation.** On publish, assigned headcount per
site+shift+date is compared against `ManpowerRequirement`. The response
includes `warnings[]` (shift/date/under-by). Publish is **blocked**
(422) when any shift is below its requirement unless the caller passes
`{ force: true }`, which requires `rosters.publish` and records the
override in the audit log.

## 3. Leave

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET/POST | `/api/v1/leaves` | `leaves.view` / `leaves.manage` | Filter `?employeeId=&type=&status=&month=`; POST creates a `PENDING` request |
| GET/PATCH/DELETE | `/api/v1/leaves/:id` | `leaves.view` / `leaves.manage` | PENDING only for PATCH/DELETE |
| POST | `/api/v1/leaves/:id/approve` | `leaves.approve` | `{ approverNote? }` → APPROVED |
| POST | `/api/v1/leaves/:id/reject` | `leaves.approve` | `{ reason }` → REJECTED |
| GET | `/api/v1/leaves/balances?employeeId=` | `leaves.view` | `{ annual: { entitled, used, remaining }, sick: { … } }` |

**Approved-leave → attendance mapping.** On approval, the service
writes one `Attendance` row per date in `[startDate, endDate]` using
the code mapped from the leave type: `ANNUAL` → `AL`, `SICK` → `SL`
(other types use the mapping configured in Settings; default `AL`).
Approval is rejected (422) on overlapping approved leaves for the same
employee. Cancelling an approved leave removes the generated `AL`/`SL`
cells it created.

## 4. Transfer

Transfer records are **append-only history** — never updated in place
after approval; corrections are new transfer records.

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET/POST | `/api/v1/transfers` | `transfers.view` / `transfers.manage` | Filter `?employeeId=&status=`; POST creates `PENDING` with old/new sector, site, shift |
| GET | `/api/v1/transfers/:id` | `transfers.view` | Full detail incl. requester/approver trail |
| POST | `/api/v1/transfers/:id/approve` | `transfers.approve` | `{ effectiveDate?, approverNote? }` → APPROVED |
| POST | `/api/v1/transfers/:id/reject` | `transfers.approve` | `{ reason }` → REJECTED |
| GET | `/api/v1/transfers/history?employeeId=` | `transfers.view` | Chronological transfer history for one employee |

**Approval effects.** On approval the service, in one transaction:
sets the employee's `sectorId`/`siteId`/`shiftId` to the new values
(effective on `effectiveDate`), marks the transfer `APPLIED`, keeps the
record as the history row, and triggers a manpower-snapshot refresh for
both the old and new sites (feeding the Shortage module). Employees
with a `PENDING` transfer cannot be included in a second pending
transfer (422).

## 5. Cross-cutting notes

- **Soft delete** applies to shifts, rosters (DRAFT only), leaves
  (PENDING only); transfers are never deleted.
- **Notifications**: approvals/rejections and publish/lock events emit
  in-app notifications (see `docs/PHASE2.md` notification endpoints).
- **Next phases**: Reports (14), Analytics (15), and Payroll (payroll-
  ready attendance) consume the Phase 3 data model unchanged.
