/**
 * Password hashing — Argon2id primary, bcrypt fallback.
 *
 * Follows docs/ARCHITECTURE.md §5: "Passwords hashed with Argon2id
 * (fallback bcrypt where native modules are unavailable)". The hash
 * prefix records which algorithm produced it ($argon2id$ / $2b$), so
 * verify() picks the right verifier automatically.
 *
 * The native argon2 binding is loaded lazily (not via a static import)
 * so a build/runtime environment where the binding cannot load fails
 * over to bcrypt instead of crashing module evaluation.
 */
import bcrypt from "bcryptjs";

export interface HashOptions {
  /** Test-only cost reduction. Never set in production. */
  testMode?: boolean;
}

const BCRYPT_ROUNDS = 12;

type Argon2Module = typeof import("argon2");

let argon2LoadAttempted = false;
let argon2Module: Argon2Module | null = null;

/**
 * Load the native argon2 module lazily (cached). A static top-level
 * import throws at module-evaluation time when the native binding
 * cannot load — e.g. in some build containers / serverless runtimes —
 * which takes the entire importing route module down with it during
 * `next build` ("Failed to collect page data"). Lazy loading keeps the
 * documented bcrypt fallback actually working.
 */
async function loadArgon2(): Promise<Argon2Module | null> {
  if (argon2LoadAttempted) return argon2Module;
  argon2LoadAttempted = true;
  try {
    argon2Module = await import("argon2");
  } catch {
    argon2Module = null;
  }
  return argon2Module;
}

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
  const a2 = await loadArgon2();
  if (a2) {
    try {
      return await a2.hash(plain, {
        type: a2.argon2id,
        // Keep server-side login latency reasonable; testMode keeps the
        // unit suite fast.
        memoryCost: opts.testMode ? 1024 : 65536,
        timeCost: opts.testMode ? 1 : 3,
        parallelism: 1,
      });
    } catch {
      // Native call failed at runtime — bcrypt fallback below.
    }
  }
  // Native module unavailable — bcrypt fallback (documented).
  return await bcrypt.hash(plain, opts.testMode ? 4 : BCRYPT_ROUNDS);
}

/** Verify a plaintext password against a stored hash. */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  if (!plain || !hash) return false;
  try {
    if (hash.startsWith("$argon2")) {
      const a2 = await loadArgon2();
      if (!a2) return false;
      return await a2.verify(hash, plain);
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
