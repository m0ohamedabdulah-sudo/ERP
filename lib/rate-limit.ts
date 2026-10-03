/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * Guards the auth endpoints (docs/ARCHITECTURE.md §7 requires rate
 * limiting on `/api/v1/auth/*`). Single-process memory: on serverless
 * each instance tracks its own counters, which still blunts brute
 * force from any single client. For multi-instance deployments, swap
 * the store for Redis — the interface stays the same.
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Max attempts per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** ms until the oldest hit leaves the window (for Retry-After). */
  retryAfterMs: number;
}

function now(): number {
  return Date.now();
}

/**
 * Record one attempt for `key` (e.g. `login:<ip>`) and report whether
 * it is within the limit. Pure-ish and unit-testable via injectable
 * clock (defaults to Date.now).
 */
export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
  clock: () => number = now,
): RateLimitResult {
  const t = clock();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  // Drop hits outside the window.
  bucket.hits = bucket.hits.filter((h) => h > t - windowMs);
  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0] ?? t;
    const retryAfterMs = Math.max(0, oldest + windowMs - t);
    return { allowed: false, retryAfterMs };
  }
  bucket.hits.push(t);
  return { allowed: true, retryAfterMs: 0 };
}

/** Test/maintenance hook: drop all counters. */
export function resetRateLimits(): void {
  buckets.clear();
}

/** Client IP for rate-limit keys — honors X-Forwarded-For behind a proxy. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip") ?? "unknown";
}
