# Easy Roster — Testing

Executable business logic lives in `src/lib/` (pure, dependency-free,
strict TypeScript); suites live in `tests/`. The web app itself is not
part of this repo yet — these tests pin the documented business rules
so any future implementation must satisfy them.

> **Sandbox note:** `vitest` and `typescript` are already declared in
> `devDependencies`, but `npm install` was not run here (Prisma's
> engine postinstall fails on this sandbox's Node 24). Run
> `npm install` on a compatible machine/CI before `npm test`.

## Running the suites

| Command | What it runs |
|---|---|
| `npm test` | All unit + contract suites (`vitest run`). Contract tests skip gracefully when `BASE_URL` is unset. |
| `npm run test:watch` | Watch mode for development. |
| `npm run test:api` | Contract tests only, against `BASE_URL=http://localhost:3000` (override per environment). |
| `npm run typecheck` | `tsc --noEmit` over `src/`, `tests/`, `prisma/`. |

Optional contract fixtures (env): `VIEWER_COOKIE` (session cookie of a
VIEWER user → asserts 403 on mutations), `LOCKED_ROSTER_ID` (asserts
409 on locked-roster assignment writes).

## Spec §32 coverage map

| Spec case | Suite | Status |
|---|---|---|
| Unit tests | `tests/unit/*.test.ts` | ✅ |
| Attendance codes P/PP/12/6/A/X/AL/SL day values | `attendance.test.ts` — each code's value, unknown-code error, configurable map injection | ✅ |
| Total P calculation | `attendance.test.ts` — mixed-code sum = 4 | ✅ |
| Months 28/29/30/31 | `attendance.test.ts` — Feb 2024 (29), Feb 2025 (28), Apr (30), Jan (31) | ✅ |
| Shortage calculation | `shortage.test.ts` — Zia Mall 25/18 → 7, 28%, CRITICAL; Bureau 58 20/18 → 10%, WARNING; Les Rois 30/30 → NORMAL; surplus case; configurable thresholds | ✅ |
| Payroll computation | `payroll.test.ts` — hand-computed net pay 4900, X-multiplier effect, unpaid leave, all-absent edge, negative-input rejection | ✅ |
| Leave day counts / overlaps | `leave.test.ts` — inclusive counts, cross-month, leap day, overlap true/false/touching | ✅ |
| Transfer validation | `transfer.test.ts` — no-op rejection, sector/site/shift changes | ✅ |
| Integration tests (DB) | Deferred — needs Postgres + Prisma client; outline below | ⬜ |
| API tests | `tests/api/contract.test.ts` — dashboard shape, red-zone severities, 401, viewer 403, locked-roster 409 | ✅ (needs live target) |
| Authentication tests | Partially via contract 401/403; full login/throttle/2FA flows deferred to E2E | ⬜ |
| Permission tests | Contract 403 check with `VIEWER_COOKIE`; matrix below | ⬜ |
| E2E tests | Playwright outline below | ⬜ |

## Deferred: integration tests

Once the app source lands in this repo, add `tests/integration/`
with a dedicated test database (`DATABASE_URL` pointing at a scratch
DB, migrations applied, seed run):

- Attendance upsert → `totalP` matches `src/lib` computation.
- Roster publish understaffing validation (422, then `force: true`).
- Locked roster rejects assignment + attendance writes (409).
- Leave approval writes AL/SL cells; overlapping approval → 422.
- Transfer approval moves employee + refreshes both sites' snapshots.
- Payroll period recompute is deterministic; APPROVED rejects recompute.
- Every mutation writes exactly one `AuditLog` row in-transaction.

## Deferred: permission matrix

Extend the contract suite with a per-role × endpoint matrix driven by
seeded users (SUPER_ADMIN … VIEWER): each mutation endpoint × each
role → 200/201 or 403. Sector/site scoping (SECTOR_MANAGER,
SITE_MANAGER) needs two-fixture setup per scope.

## Deferred: E2E (Playwright outline)

Critical flows, against a seeded staging environment:

1. **Login** — valid credentials → dashboard; wrong password →
   generic error; throttling after N attempts; 2FA challenge when
   enabled; logout revokes session.
2. **Attendance entry** — open September grid for Zia Mall, set a
   cell to PP, Total P updates; invalid code rejected; locked period
   blocks edits.
3. **Roster publish** — build roster below required staffing →
   publish blocked with warnings; `force` publishes with audit row;
   lock → further edits 409.
4. **Leave approval** — request 3-day annual leave → approve →
   AL cells appear in attendance; overlapping request → 422.
5. **Transfer** — request site change → approve → employee site
   updates, history row exists, both sites' shortage recalculated.
6. **Payroll export** — compute period, approve, export CSV;
   verify net pay matches `src/lib` computation for a sample row.
7. **Red Zone drill-down** — critical site row → detail drawer shows
   per-shift breakdown.

## What's covered vs deferred

Covered now: all pure business rules (attendance, shortage, payroll,
leave, transfer) with executable tests, plus API contract shapes and
auth/permission/lock guards that run against any live target.

Deferred until the app source + test DB exist in this repo:
integration tests, the full permission matrix, and Playwright E2E.
The outlines above are the acceptance criteria for that work.
