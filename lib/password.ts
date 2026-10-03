/**
 * Password hashing — Argon2id primary, bcrypt fallback.
 *
 * Follows docs/ARCHITECTURE.md §5: "Passwords hashed with Argon2id
 * (fallback bcrypt where native modules are unavailable)". The hash
 * prefix records which algorithm produced it ($argon2id$ / $2b$), so
 * verify() picks the right verifier automatically.
 */
import argon2 from "argon2";
import bcrypt from "bcryptjs";

export interface HashOptions {
  /** Test-only cost reduction. Never set in production. */
  testMode?: boolean;
}

const BCRYPT_ROUNDS = 12;

/**
 * Hash a plaintext password. Tries Argon2id first; falls back to
 * bcrypt when the native argon2 module cannot load (some serverless
 * / edge runtimes).
 */
export async function hashPassword(
  plain: string,
  opts: HashOptions = {},
): Promise<string> {
  if (!plain || plain.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  try {
    return await argon2.hash(plain, {
      type: argon2.argon2id,
      // Keep server-side login latency reasonable; testMode keeps the
      // unit suite fast.
      memoryCost: opts.testMode ? 1024 : 65536,
      timeCost: opts.testMode ? 1 : 3,
      parallelism: 1,
    });
  } catch {
    // Native module unavailable — bcrypt fallback (documented).
    return await bcrypt.hash(plain, opts.testMode ? 4 : BCRYPT_ROUNDS);
  }
}

/** Verify a plaintext password against a stored hash. */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  if (!plain || !hash) return false;
  try {
    if (hash.startsWith("$argon2")) {
      return await argon2.verify(hash, plain);
    }
    if (hash.startsWith("$2a$") || hash.startsWith("$2b$")) {
      return await bcrypt.compare(plain, hash);
    }
    return false;
  } catch {
    return false;
  }
}

/** True when the stored hash should be upgraded (e.g. bcrypt → Argon2id). */
export function needsRehash(hash: string): boolean {
  return !hash.startsWith("$argon2id$");
}
