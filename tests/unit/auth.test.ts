/**
 * Unit tests for the auth primitives — pure functions, no DB.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { hashPassword, verifyPassword, needsRehash } from "../../lib/password";
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../lib/jwt";
import { checkRateLimit, resetRateLimits } from "../../lib/rate-limit";
import { getCookie } from "../../lib/auth";

// JWT_SECRET is required by lib/jwt — set a deterministic test value.
process.env.JWT_SECRET =
  "test-secret-that-is-long-enough-for-hs256-0123456789";

describe("hashPassword / verifyPassword", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("correct-horse-8", { testMode: true });
    expect(await verifyPassword("correct-horse-8", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("rejects short passwords", async () => {
    await expect(hashPassword("short", { testMode: true })).rejects.toThrow();
  });

  it("returns false for empty inputs", async () => {
    expect(await verifyPassword("", "$argon2id$v=19$x")).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
  });

  it("flags non-argon2id hashes for rehash", () => {
    expect(needsRehash("$2b$12$abcdefghijklmnopqrstuu")).toBe(true);
    expect(needsRehash("$argon2id$v=19$m=65536,t=3,p=1$abc$def")).toBe(false);
  });
});

describe("access / refresh tokens", () => {
  it("round-trips an access token", async () => {
    const token = await signAccessToken("user-1");
    const claims = await verifyAccessToken(token);
    expect(claims.sub).toBe("user-1");
    expect(claims.typ).toBe("access");
  });

  it("round-trips a refresh token with session id", async () => {
    const token = await signRefreshToken("user-1", "sess-1");
    const claims = await verifyRefreshToken(token);
    expect(claims.sub).toBe("user-1");
    expect(claims.sid).toBe("sess-1");
  });

  it("rejects cross-kind use", async () => {
    const access = await signAccessToken("user-1");
    await expect(verifyRefreshToken(access)).rejects.toThrow();
    const refresh = await signRefreshToken("user-1", "sess-1");
    await expect(verifyAccessToken(refresh)).rejects.toThrow();
  });

  it("rejects tampered tokens", async () => {
    const token = await signAccessToken("user-1");
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    await expect(verifyAccessToken(tampered)).rejects.toThrow();
  });
});

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to the limit, then blocks", () => {
    const opts = { limit: 3, windowMs: 60_000 };
    expect(checkRateLimit("k", opts).allowed).toBe(true);
    expect(checkRateLimit("k", opts).allowed).toBe(true);
    expect(checkRateLimit("k", opts).allowed).toBe(true);
    const blocked = checkRateLimit("k", opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("slides the window with an injectable clock", () => {
    const opts = { limit: 1, windowMs: 1_000 };
    let t = 0;
    expect(checkRateLimit("k2", opts, () => t).allowed).toBe(true);
    expect(checkRateLimit("k2", opts, () => t).allowed).toBe(false);
    t = 1_001;
    expect(checkRateLimit("k2", opts, () => t).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect(checkRateLimit("a", opts).allowed).toBe(true);
    expect(checkRateLimit("b", opts).allowed).toBe(true);
    expect(checkRateLimit("a", opts).allowed).toBe(false);
  });
});

describe("getCookie", () => {
  const req = (cookie: string | null) =>
    new Request("http://x/", cookie ? { headers: { cookie } } : {});

  it("parses cookie values", () => {
    expect(getCookie(req("er_access=abc123; other=x"), "er_access")).toBe(
      "abc123",
    );
    expect(getCookie(req("other=x; er_access=abc123"), "er_access")).toBe(
      "abc123",
    );
  });

  it("returns null when absent", () => {
    expect(getCookie(req("other=x"), "er_access")).toBeNull();
    expect(getCookie(req(null), "er_access")).toBeNull();
  });
});
