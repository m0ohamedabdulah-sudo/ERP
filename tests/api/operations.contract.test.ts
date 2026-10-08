/**
 * REST API contract tests — Batch 1: Operations Command Center.
 *
 * Run against a live deployment via BASE_URL, e.g.:
 *   BASE_URL=http://localhost:3000 npm run test:api
 *
 * Uses only node fetch — no extra dependencies. When BASE_URL is unset
 * the suite skips with a clear message instead of failing.
 *
 * Optional: set ERP_AUTH_HEADERS=1 and run the server with
 * ALLOW_DEV_ACTOR=true plus the demo seed to exercise the
 * authenticated (x-dev-actor) paths.
 */
import { beforeAll, describe, expect, it } from 'vitest';

const RAW_BASE_URL = process.env.BASE_URL;
// NOTE: inside vitest, Vite's default `base: '/'` leaks into
// process.env.BASE_URL as "/". Treat that as "no live server".
const BASE_URL = RAW_BASE_URL && RAW_BASE_URL !== '/' ? RAW_BASE_URL : undefined;
const WITH_AUTH = process.env.ERP_AUTH_HEADERS === '1';

const run = BASE_URL ? describe : describe.skip;

if (!BASE_URL) {
  console.warn(
    '[contract:operations] BASE_URL is not set — skipping. ' +
      'Run with BASE_URL=http://localhost:3000 npm run test:api',
  );
}

interface Envelope<T = unknown> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
  error?: { code: string; message: string };
}

async function call<T>(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  payload?: unknown,
): Promise<{ status: number; body: Envelope<T> }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(payload ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  return { status: res.status, body: (await res.json()) as Envelope<T> };
}

const devActor = (role: string) => ({ 'x-dev-actor': role });

function expectErrorEnvelope(body: Envelope, code: string) {
  expect(body.success).toBe(false);
  expect(body.error?.code).toBe(code);
  expect(typeof body.error?.message).toBe('string');
}

run('Operations — public token-gated endpoints', () => {
  beforeAll(() => {
    expect(BASE_URL, 'BASE_URL must be set').toBeTruthy();
  });

  it('POST /api/v1/operations/checkin with an unknown token returns 410 INVALID_QR_TOKEN', async () => {
    const { status, body } = await call(
      'POST',
      '/api/v1/operations/checkin',
      {},
      { qrToken: 'does-not-exist-token', cardNumber: 'EMP-2026-001' },
    );
    expect(status).toBe(410);
    expectErrorEnvelope(body, 'INVALID_QR_TOKEN');
  });

  it('POST /api/v1/operations/checkout with an unknown token returns 410 INVALID_QR_TOKEN', async () => {
    const { status, body } = await call(
      'POST',
      '/api/v1/operations/checkout',
      {},
      { qrToken: 'does-not-exist-token', cardNumber: 'EMP-2026-001' },
    );
    expect(status).toBe(410);
    expectErrorEnvelope(body, 'INVALID_QR_TOKEN');
  });

  it('POST /api/v1/operations/checkin validates the body (422)', async () => {
    const { status, body } = await call('POST', '/api/v1/operations/checkin', {}, { bogus: true });
    expect(status).toBe(422);
    expect(body.success).toBe(false);
  });

  it('GET /api/v1/operations/token/:token with an unknown token returns 410', async () => {
    const { status, body } = await call('GET', '/api/v1/operations/token/nope-not-real');
    expect(status).toBe(410);
    expectErrorEnvelope(body, 'INVALID_QR_TOKEN');
  });
});

run('Operations — guarded endpoints require identity', () => {
  beforeAll(() => {
    expect(BASE_URL, 'BASE_URL must be set').toBeTruthy();
  });

  it.each([
    ['GET', '/api/v1/operations/live'],
    ['GET', '/api/v1/operations/qr/11111111-1111-1111-1111-111111111111'],
    ['POST', '/api/v1/operations/checkin/manual'],
  ])('%s %s without identity returns 401 UNAUTHENTICATED', async (method, path) => {
    const { status, body } = await call(method, path, {}, method === 'POST' ? { bogus: 1 } : undefined);
    expect(status).toBe(401);
    expectErrorEnvelope(body, 'UNAUTHENTICATED');
  });
});

const runAuth = BASE_URL && WITH_AUTH ? describe : describe.skip;

runAuth('Operations — authenticated RBAC (ALLOW_DEV_ACTOR)', () => {
  it('VIEWER gets 403 on the live board', async () => {
    const { status, body } = await call('GET', '/api/v1/operations/live', devActor('VIEWER'));
    expect(status).toBe(403);
    expectErrorEnvelope(body, 'FORBIDDEN');
  });

  it('SUPER_ADMIN gets the live board envelope', async () => {
    const { status, body } = await call<{
      date: string;
      sites: unknown[];
      alerts: unknown[];
      totals: Record<string, number>;
    }>('GET', '/api/v1/operations/live', devActor('SUPER_ADMIN'));
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(typeof body.data.date).toBe('string');
    expect(Array.isArray(body.data.sites)).toBe(true);
    expect(Array.isArray(body.data.alerts)).toBe(true);
    expect(typeof body.data.totals.present).toBe('number');
  });

  it('manual check-in validates the body (422) for SUPER_ADMIN', async () => {
    const { status, body } = await call(
      'POST',
      '/api/v1/operations/checkin/manual',
      devActor('SUPER_ADMIN'),
      { bogus: true },
    );
    expect(status).toBe(422);
    expect(body.success).toBe(false);
  });
});
