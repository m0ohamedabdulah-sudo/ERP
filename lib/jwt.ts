/**
 * JWT session tokens (HS256 via `jose` — works in Node and Edge runtimes).
 *
 * Two token kinds, per docs/ARCHITECTURE.md §5:
 *  - access:  short-lived (15 min), sent with every request
 *  - refresh: long-lived (7 days), httpOnly cookie only, rotated on use
 *
 * The `typ` claim separates the kinds; verify*() rejects cross-use.
 * Secrets come from env (never NEXT_PUBLIC_*). A missing JWT_SECRET is
 * a boot-time programmer error — fail fast, not at first login.
 */
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "JWT_SECRET must be set to a random value of at least 32 characters",
    );
  }
  return new TextEncoder().encode(s);
}

export interface AccessClaims extends JWTPayload {
  typ: "access";
  sub: string; // user id
}

export interface RefreshClaims extends JWTPayload {
  typ: "refresh";
  sub: string; // user id
  sid: string; // session id (Session table row)
}

async function sign(
  claims: Record<string, unknown>,
  ttlSeconds: number,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret());
}

/** Mint a short-lived access token for the user. */
export function signAccessToken(userId: string): Promise<string> {
  return sign({ typ: "access", sub: userId }, ACCESS_TTL_SECONDS);
}

/** Mint a refresh token bound to a Session row. */
export function signRefreshToken(
  userId: string,
  sessionId: string,
): Promise<string> {
  return sign(
    { typ: "refresh", sub: userId, sid: sessionId },
    REFRESH_TTL_SECONDS,
  );
}

async function verify<T extends JWTPayload>(token: string): Promise<T> {
  const { payload } = await jwtVerify(token, secret(), {
    algorithms: ["HS256"],
  });
  return payload as T;
}

/** Verify an access token; throws on expiry / tampering / wrong kind. */
export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const p = await verify<AccessClaims>(token);
  if (p.typ !== "access" || typeof p.sub !== "string") {
    throw new Error("Not an access token");
  }
  return p;
}

/** Verify a refresh token; throws on expiry / tampering / wrong kind. */
export async function verifyRefreshToken(
  token: string,
): Promise<RefreshClaims> {
  const p = await verify<RefreshClaims>(token);
  if (p.typ !== "refresh" || typeof p.sub !== "string" || typeof p.sid !== "string") {
    throw new Error("Not a refresh token");
  }
  return p;
}
