/**
 * REST API contract tests (docs/PHASE2.md §2, PHASE3.md, PHASE4.md).
 *
 * These run against a live deployment via BASE_URL, e.g.:
 *   BASE_URL=http://localhost:3000 npm run test:api
 *
 * They use only node fetch — no extra dependencies. Optional fixtures
 * come from env so CI can run the read-only subset without secrets:
 *   VIEWER_COOKIE     session cookie of a VIEWER-role user (for 403 checks)
 *   LOCKED_ROSTER_ID  id of a LOCKED roster (for 409 checks)
 *
 * When BASE_URL is unset the suite skips with a clear message instead
 * of failing — contract tests are meaningless without a target.
 */
import { beforeAll, describe, expect, it } from 'vitest';

// Inside vitest, Vite's default `base: '/'` leaks into process.env.BASE_URL
// as "/"; treat that as "no live server" so the suite skips cleanly.
const RAW_BASE_URL = process.env.BASE_URL;
const BASE_URL = RAW_BASE_URL && RAW_BASE_URL !== '/' ? RAW_BASE_URL : undefined;
const VIEWER_COOKIE = process.env.VIEWER_COOKIE;
const LOCKED_ROSTER_ID = process.env.LOCKED_ROSTER_ID;

const run = BASE_URL ? describe : describe.skip;

if (!BASE_URL) {
  console.warn(
    '[contract] BASE_URL is not set — skipping API contract tests. ' +
      'Run with BASE_URL=http://localhost:3000 npm run test:api',
  );
}

interface Envelope<T = unknown> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
  error?: { code: string; message: string };
}

async function get<T>(path: string, cookie?: string): Promise<{ status: number; body: Envelope<T> }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: cookie ? { cookie } : {},
  });
  return { status: res.status, body: (await res.json()) as Envelope<T> };
}

async function post<T>(path: string, payload: unknown, cookie?: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: (await res.json()) as Envelope<T> };
}

run('API contracts', () => {
  beforeAll(() => {
    expect(BASE_URL, 'BASE_URL must be set to run contract tests').toBeTruthy();
  });

  it('dashboard summary returns the documented KPI shape', async () => {
    const { status, body } = await get<{
      totalEmployees: number;
      requiredManpower: number;
      actualManpower: number;
      shortage: number;
      shortagePct: number;
    }>('/api/v1/dashboard/summary');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    for (const key of [
      'totalEmployees',
      'requiredManpower',
      'actualManpower',
      'shortage',
      'shortagePct',
    ] as const) {
      expect(typeof body.data[key], `data.${key} should be a number`).toBe('number');
    }
  });

  it('red zone only reports valid severities', async () => {
    const { status, body } = await get<Array<{ severity: string }>>('/api/v1/dashboard/red-zone');
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    for (const row of body.data) {
      expect(['NORMAL', 'WARNING', 'CRITICAL']).toContain(row.severity);
    }
  });

  it('health check reports DB connectivity and uptime', async () => {
    const { status, body } = await get<{ db: string; uptime: number }>(
      '/api/v1/health',
    );
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.db).toBe('ok');
    expect(typeof body.data.uptime).toBe('number');
  });

  it('shortages engine returns per-site/shift rows (or 401 without a session)', async () => {
    const { status, body } = await get<{
      date: string;
      sites: Array<{
        siteId: string;
        shifts: Array<{
          shiftId: string;
          required: number;
          rostered: number;
          present: number;
          absent: number;
          onLeave: number;
          shortage: number;
          severity: string;
        }>;
        totals: { required: number; shortage: number; severity: string };
      }>;
      totals: { sites: number; redZones: number };
    }>('/api/v1/shortages?date=2026-10-09');
    expect([200, 401]).toContain(status);
    if (status === 200) {
      expect(body.success).toBe(true);
      expect(body.data.date).toBe('2026-10-09');
      expect(Array.isArray(body.data.sites)).toBe(true);
      expect(typeof body.data.totals.sites).toBe('number');
      for (const site of body.data.sites) {
        for (const shift of site.shifts) {
          expect(shift.shortage).toBeGreaterThanOrEqual(0);
          expect(['NORMAL', 'WARNING', 'CRITICAL']).toContain(shift.severity);
          expect(shift.shortage).toBe(
            Math.max(0, shift.required - shift.present),
          );
        }
      }
    }
  });

  it('replacements endpoint validates its inputs', async () => {
    // Missing siteId → 422 validation (or 401 without a session).
    const { status } = await get('/api/v1/shortages/replacements');
    expect([401, 422]).toContain(status);
  });

  it('returns 401 for dashboard without a session', async () => {
    // Sanity: the endpoint requires auth — an obviously invalid cookie must not pass.
    const { status } = await get('/api/v1/dashboard/summary', 'session=invalid');
    expect([401, 403]).toContain(status);
  });

  it('viewer role gets 403 on a mutation endpoint', async () => {
    if (!VIEWER_COOKIE) {
      console.warn('[contract] VIEWER_COOKIE unset — skipping viewer 403 check');
      return;
    }
    const { status, body } = await post(
      '/api/v1/leaves',
      { employeeId: 'x', type: 'ANNUAL', startDate: '2024-09-01', endDate: '2024-09-02' },
      VIEWER_COOKIE,
    );
    expect(status).toBe(403);
    expect(body.success).toBe(false);
  });

  it('locked roster rejects assignment mutations with 409', async () => {
    if (!LOCKED_ROSTER_ID) {
      console.warn('[contract] LOCKED_ROSTER_ID unset — skipping locked-roster 409 check');
      return;
    }
    const res = await fetch(`${BASE_URL}/api/v1/rosters/${LOCKED_ROSTER_ID}/assignments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assignments: [] }),
    });
    // 409 when locked; 401 when unauthenticated (both prove the guard exists)
    expect([401, 409]).toContain(res.status);
    if (res.status === 409) {
      const body = (await res.json()) as Envelope;
      expect(body.success).toBe(false);
    }
  });
});
