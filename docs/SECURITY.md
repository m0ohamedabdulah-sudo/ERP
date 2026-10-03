# Easy Roster — Security: Final Hardening

This document specifies the production credential-authentication and
large-export hardening work that closed the two gaps left by Phase 4
(see [docs/PHASE4.md](PHASE4.md) §5). All endpoints live under
`/api/v1`, use the common envelope from [docs/API.md](API.md), and
every security-relevant action writes an `AuditLog` row in the same
transaction ([docs/PHASE2.md](PHASE2.md) §3).

## 1. Credential authentication

### Password hashing (Argon2id)

- Algorithm: Argon2id per RFC 9106 (first recommendation for
  general-purpose use): **memory 64 MiB (`m=65536`)**, **iterations
  `t=3`**, **parallelism `p=4`**, output length 32 bytes, salt 16
  bytes (CSPRNG).
- Parameters are stored alongside the hash in the encoded PHC string
  (`$argon2id$v=19$m=65536,t=3,p=4$…`) so future migrations can
  re-hash on login; a `passwordHashVersion` column on `User` tracks
  the active parameter set.
- The `passwordHash` column is **never selected into application
  code except inside the single verify function**; repositories
  exclude it by default and a `getForVerification` path loads only
  `id` + `passwordHash`.
- Verification runs in constant time (library `verify`); success or
  failure costs are indistinguishable to an observer.

### Anti-enumeration

- Login, reset, and 2FA challenge responses always return the same
  generic failure (`"Invalid credentials"`), whether the account
  exists or not. Account-exists checks for the reset flow reply
  `"If the account exists, a reset link was sent"` — identically in
  both cases, with identical timing.
- Registration is disabled in production (accounts are created by
  `users.manage` holders); the invite flow never reveals whether an
  email is already registered.

### Throttling

- Per-IP and per-account throttles with exponential backoff on
  failed logins: after 5 failures, each account backs off
  2ⁿ seconds (n = consecutive failures, capped at 15 min); per-IP
  counting follows the Phase 4 auth rate limit (10 req/min,
  see [docs/PHASE4.md](PHASE4.md) §5).
- Counters live in a fast store (in-memory with DB fallback) keyed
  `login_fail:ip:<ip>` / `login_fail:account:<id>`; a successful
  login clears both. Breach of limits → 429 with `Retry-After`.

### Password policy

- Minimum 12 characters; requires uppercase, lowercase, digit, and
  symbol. Checked server-side with Zod on set/change; client hints
  only.
- Breached-password screening: the hash is never sent anywhere;
  only a k-anonymity prefix check against a compromised-password
  corpus may run (configurable, default on).
- Password history (last 5 hashes) blocks reuse; hashes compared via
  the verify function, never by equality.

### Change-password and reset flows

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| POST | `/api/v1/auth/password/change` | authenticated | `{ currentPassword, newPassword }`; verifies current, enforces policy, rotates session, audit `auth.password.change` |
| POST | `/api/v1/auth/password/reset/request` | public | `{ email }`; always returns the generic "if it exists" message |
| POST | `/api/v1/auth/password/reset/confirm` | public | `{ token, newPassword }`; one-time token |

- Reset tokens: 32-byte CSPRNG value; **only the SHA-256 hash is
  stored** (`passwordResetTokens` table: `tokenHash`, `userId`,
  `expiresAt` = 30 min, `usedAt`); plaintext token goes to the user
  by email only. Confirmation hashes the presented token and looks
  up the row; on success the row is marked used in the same
  transaction — one-time use enforced at the DB level.
- After any password change/reset: all other sessions for that user
  are revoked (server-side revocation list), and a notification is
  emitted (`auth.password.changed`).

## 2. Session management

- Session identifier: signed JWT (`sub`, `role`, `permissions`,
  `sid`) carried in an **httpOnly + Secure + `SameSite=Lax`**
  cookie; never in `localStorage`.
- Timeouts: **absolute 8 hours**, **idle 30 minutes** (sliding,
  refreshed server-side per request); expiry enforced by both the
  JWT `exp` claim and the server session record.
- **Rotation on privilege change**: role/permission changes,
  2FA enable/disable, and password changes issue a new `sid` and
  invalidate the old one immediately.
- **Server-side revocation list**: `sessions` table
  (`sid`, `userId`, `expiresAt`, `revokedAt`); every request checks
  membership. Logout, password change, and admin-forced revocation
  set `revokedAt`. A periodic job purges expired rows.
- **CSRF**: double-submit cookie + `X-CSRF-Token` header on all
  cookie-authenticated mutations; token bound to the session and
  rotated with it. Safe methods (GET/HEAD) are exempt; `Origin`
  allow-list checked as defense in depth.

## 3. Two-factor authentication (TOTP)

Full endpoint contract in [docs/PHASE4.md](PHASE4.md) §5; the
hardened rules here:

- `POST /api/v1/auth/2fa/setup` returns the `otpauth://` URI / QR
  payload **exactly once**; the secret is stored **encrypted at
  rest** (AES-256-GCM, key from server env) and never returned
  again. Until `verify` succeeds, 2FA stays disabled.
- `POST /api/v1/auth/2fa/verify` accepts ±1 time-step drift;
  on success 2FA is enabled, the session rotates, and **10 backup
  codes** are issued — each a 10-character CSPRNG string, **hashed
  (SHA-256) at rest, single-use** (marked used in-transaction).
- `POST /api/v1/auth/2fa/disable` requires `{ password, code }`;
  writes an audit row and notifies the user.
- Login with 2FA enabled: valid password → `2fa_required`
  challenge (short-lived 5-min token, no session) → valid TOTP or
  backup code → session cookie issued. Backup-code use consumes
  the code and emits a notification.

## 4. Export hardening

### Chunked server-side PDF generation

- PDF generation never loads a whole report into memory: the
  service fetches rows in **page-size chunks** (`pageSize` ≤ 500),
  renders page by page, and **streams** the response
  (`Transfer-Encoding: chunked`, `Content-Disposition: attachment`).
- Header/footer and pagination ("Page X of Y") are computed from
  the row count obtained first via a `COUNT(*)` query; the
  streaming writer back-pressures on chunk fetch.

### Async job pattern for large exports

- Reports exceeding the synchronous threshold (configurable,
  default 10 000 rows) are enqueued as export jobs
  (`exportJobs`: `id`, `userId`, `type`, `filters`, `format`,
  `status`, `resultPath`, `expiresAt`).
- `POST /api/v1/reports/:type?format=…&async=true` returns
  `{ jobId, status: "queued" }`; `GET /api/v1/export-jobs/:id`
  polls status; completion delivers an **in-app notification**
  with a time-limited download link (`expiresAt` = 24 h).
- Job workers run with the requesting user's permissions captured
  at enqueue time; files are stored outside the web root and
  deleted after expiry.

### Rate limits

Per the table in [docs/PHASE4.md](PHASE4.md) §5 (auth 10/min/IP,
general 300/min/session, exports 10/min/session, AI 30/min/session;
429 + `Retry-After`). Export jobs additionally cap **concurrent
jobs per user** (default 2) to bound worker load.

### Security audit events

Every one of the following writes an audit row with actor, IP,
and outcome: `auth.login.success/failure`, `auth.logout`,
`auth.password.change`, `auth.password.reset.request/confirm`,
`auth.2fa.setup/verify/disable`, `auth.session.revoked`,
`auth.throttle.triggered`, `report.export`, `payroll.export`,
`export.job.queued/completed/failed`, `ai.insight.request`,
`users.role.changed`. Export rows record type, filters, format,
row count, and (for jobs) the job id — never row contents.

## 5. No-secrets-to-frontend guarantee

- **Startup env audit**: on boot the server scans `process.env`
  and fails fast if any known-secret key (`JWT_SECRET`,
  `AI_API_KEY`, `AI_MODEL`, `TOTP_ENCRYPTION_KEY`,
  `DATABASE_URL`, `BACKUP_ENCRYPTION_KEY`) carries a
  `NEXT_PUBLIC_` prefix or is missing in production.
- **Serializer exclusions**: API serializers strip `passwordHash`,
  `twoFactorSecret`, password-reset token hashes, backup-code
  hashes, and raw session ids by default; a compile-time allow-list
  (`safeUserFields`) is the only path to user JSON. Audit rows
  never contain secrets, tokens, or PII beyond the actor id.
- **AI keys** remain server-only (`AI_API_KEY`, `AI_MODEL`): never
  prefixed, never bundled, never returned by any endpoint, never
  logged — see [docs/PHASE4.md](PHASE4.md) §4.

## 6. Seeded demo accounts

Seeded only when `SEED_DEMO=true` (dev/demo environments). Roles
are fixed; **no passwords are documented or committed** — Argon2id
hashes are generated at seed time from a per-boot random secret
printed once to the server console, and the operator must change
them immediately. Production boot refuses to start with demo
accounts present (`ALLOW_DEMO_ACCOUNTS` unset) unless explicitly
acknowledged.

| Email | Role | Permissions scope |
|---|---|---|
| `admin@easyroster.demo` | Super Admin | all permissions |
| `hr@easyroster.demo` | HR Manager | employees, leaves, transfers, payroll |
| `ops@easyroster.demo` | Operations Manager | sites, roster, manpower, shortage, reports |
| `site@easyroster.demo` | Site Manager | own site(s): roster, attendance, manpower |
| `viewer@easyroster.demo` | Viewer | read-only across modules |

Demo accounts are tagged `isDemo: true`, excluded from analytics
and payroll, and blocked from the password-reset-by-email flow
(operator resets them via CLI instead).
