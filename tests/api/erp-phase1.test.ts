/**
 * REST API contract tests — Security ERP Phase 1 (clients/contracts/billing).
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
    '[contract:erp-phase1] BASE_URL is not set — skipping. ' +
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

run('ERP Phase 1 — auth guards', () => {
  beforeAll(() => {
    expect(BASE_URL, 'BASE_URL must be set').toBeTruthy();
  });

  it.each([
    ['GET', '/api/v1/clients'],
    ['GET', '/api/v1/contracts'],
    ['GET', '/api/v1/invoices'],
  ])('%s %s without identity returns 401 UNAUTHENTICATED', async (method, path) => {
    const { status, body } = await call(method, path);
    expect(status).toBe(401);
    expectErrorEnvelope(body, 'UNAUTHENTICATED');
  });

  it('POST /api/v1/clients without identity returns 401 (auth runs before validation)', async () => {
    const { status, body } = await call('POST', '/api/v1/clients', {}, { bogus: true });
    expect(status).toBe(401);
    expectErrorEnvelope(body, 'UNAUTHENTICATED');
  });
});

const runAuth = BASE_URL && WITH_AUTH ? describe : describe.skip;

runAuth('ERP Phase 1 — authenticated RBAC + envelopes (ALLOW_DEV_ACTOR)', () => {
  it('VIEWER role gets 403 on clients list', async () => {
    const { status, body } = await call('GET', '/api/v1/clients', devActor('VIEWER'));
    expect(status).toBe(403);
    expectErrorEnvelope(body, 'FORBIDDEN');
  });

  it('SUPER_ADMIN gets a paginated envelope on clients list', async () => {
    const { status, body } = await call<{
      // data is an array; meta carries pagination
    }>('GET', '/api/v1/clients?page=1&pageSize=5', devActor('SUPER_ADMIN'));
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    for (const k of ['page', 'pageSize', 'total', 'totalPages']) {
      expect(typeof (body.meta as Record<string, unknown>)[k]).toBe('number');
    }
  });

  it('POST /api/v1/clients with invalid body returns 422 VALIDATION_ERROR', async () => {
    const { status, body } = await call(
      'POST',
      '/api/v1/clients',
      devActor('SUPER_ADMIN'),
      { companyNameAr: 'x' }, // missing companyNameEn
    );
    expect(status).toBe(422);
    expectErrorEnvelope(body, 'VALIDATION_ERROR');
  });

  it('generating an invoice for a missing contract returns 404', async () => {
    const { status, body } = await call(
      'POST',
      '/api/v1/invoices',
      devActor('SUPER_ADMIN'),
      {
        contractId: '00000000-0000-0000-0000-000000000000',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      },
    );
    expect(status).toBe(404);
    expect(body.success).toBe(false);
  });
});
