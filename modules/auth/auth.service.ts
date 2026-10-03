/**
 * Auth service — credential login, session lifecycle, first-run setup.
 *
 * Design (docs/ARCHITECTURE.md §5):
 *  - Argon2id password hashes (bcrypt fallback where native unavailable)
 *  - Short-lived access JWT (15 min) + rotating refresh JWT (7 days),
 *    both delivered as httpOnly cookies by the controller
 *  - Refresh tokens are stored as SHA-256 hashes in the Session table;
 *    rotation deletes the old row on every refresh (reuse ⇒ all
 *    sessions for the user are revoked — theft detection)
 *  - Logins are audit-logged
 */
import { createHash, randomUUID } from "crypto";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/api-response";
import { hashPassword, verifyPassword, needsRehash } from "../../lib/password";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  REFRESH_TTL_SECONDS,
} from "../../lib/jwt";
import { getCookie, REFRESH_COOKIE } from "../../lib/auth";
import { checkRateLimit, clientIp } from "../../lib/rate-limit";
import { writeAudit } from "../../lib/audit";
import { ensureRolesAndPermissions } from "../../lib/bootstrap";
import type { LoginInput, SetupInput } from "./auth.schema";

export const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };
export const SETUP_RATE_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 };

/** Dummy hash so unknown-email logins cost the same as real verifies. */
const DUMMY_HASH =
  "$argon2id$v=19$m=1024,t=1,p=1$c29tZXNhbHQ$Rdescudv6o5J6gEPaR9lA";

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function rateLimitOrThrow(
  req: Request,
  scope: string,
  opts: { limit: number; windowMs: number },
): void {
  const res = checkRateLimit(`auth:${scope}:${clientIp(req)}`, opts);
  if (!res.allowed) {
    throw new ApiError(
      "RATE_LIMITED",
      "Too many attempts — try again later",
      429,
      { retryAfterMs: res.retryAfterMs },
    );
  }
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    permissions: string[];
  };
}

async function loadUserWithPermissions(email: string) {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: {
      role: { include: { rolePermissions: { include: { permission: true } } } },
    },
  });
}

/** Authenticate by email+password; throws ApiError(401) on any failure. */
export async function login(
  req: Request,
  input: LoginInput,
): Promise<LoginResult> {
  rateLimitOrThrow(req, "login", LOGIN_RATE_LIMIT);

  const user = await loadUserWithPermissions(input.email);
  const hash = user?.passwordHash ?? DUMMY_HASH;
  const passwordOk = await verifyPassword(input.password, hash);

  if (!user || !passwordOk || !user.isActive || user.deletedAt) {
    // Generic message — never reveal whether the email exists.
    throw new ApiError("INVALID_CREDENTIALS", "Invalid email or password", 401);
  }

  // Transparent hash upgrade (e.g. bcrypt → Argon2id).
  if (needsRehash(user.passwordHash)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.password) },
    });
  }

  // Bind the refresh JWT to its Session row (sid claim = row id).
  const sessionId = randomUUID();
  const refreshToken = await signRefreshToken(user.id, sessionId);
  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      tokenHash: sha256Hex(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
    },
  });

  const accessToken = await signAccessToken(user.id);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await writeAudit(
    prisma,
    { userId: user.id, role: user.role.name, permissions: [] },
    { action: "auth.login", module: "auth", recordId: user.id },
    req,
  );

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.name,
      permissions: user.role.rolePermissions.map((rp) => rp.permission.key),
    },
  };
}

/** Rotate a refresh token; returns the new pair. */
export async function refresh(req: Request): Promise<LoginResult> {
  rateLimitOrThrow(req, "refresh", LOGIN_RATE_LIMIT);
  const raw = getCookie(req, REFRESH_COOKIE);
  if (!raw) throw new ApiError("UNAUTHENTICATED", "Authentication required", 401);

  let claims: { sub: string; sid: string };
  try {
    claims = await verifyRefreshToken(raw);
  } catch {
    throw new ApiError("UNAUTHENTICATED", "Authentication required", 401);
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256Hex(raw) },
    include: {
      user: {
        include: {
          role: { include: { rolePermissions: { include: { permission: true } } } },
        },
      },
    },
  });

  // Unknown/expired session ⇒ possible token reuse: revoke everything.
  if (!session || session.expiresAt.getTime() < Date.now()) {
    await prisma.session.deleteMany({ where: { userId: claims.sub } });
    throw new ApiError("UNAUTHENTICATED", "Authentication required", 401);
  }
  const { user } = session;
  if (!user.isActive || user.deletedAt) {
    await prisma.session.delete({ where: { id: session.id } });
    throw new ApiError("UNAUTHENTICATED", "Authentication required", 401);
  }

  // Rotation: single-use refresh tokens.
  await prisma.session.delete({ where: { id: session.id } });
  const newSessionId = randomUUID();
  const newRefresh = await signRefreshToken(user.id, newSessionId);
  await prisma.session.create({
    data: {
      id: newSessionId,
      userId: user.id,
      tokenHash: sha256Hex(newRefresh),
      expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
    },
  });

  const accessToken = await signAccessToken(user.id);
  return {
    accessToken,
    refreshToken: newRefresh,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.name,
      permissions: user.role.rolePermissions.map((rp) => rp.permission.key),
    },
  };
}

/** Revoke the current refresh session (idempotent). */
export async function logout(req: Request): Promise<void> {
  const raw = getCookie(req, REFRESH_COOKIE);
  if (!raw) return;
  await prisma.session.deleteMany({ where: { tokenHash: sha256Hex(raw) } });
}

/** True when no user exists yet — first-run setup is required. */
export async function isSetupNeeded(): Promise<boolean> {
  return (await prisma.user.count()) === 0;
}

/**
 * First-run bootstrap: creates the permission catalog, roles, and the
 * initial SUPER_ADMIN user. Refuses when any user already exists —
 * the endpoint is dead after first use.
 */
export async function setup(
  req: Request,
  input: SetupInput,
): Promise<{ id: string; email: string; fullName: string }> {
  rateLimitOrThrow(req, "setup", SETUP_RATE_LIMIT);
  if (!(await isSetupNeeded())) {
    throw new ApiError("SETUP_COMPLETE", "Setup has already been completed", 403);
  }
  const email = input.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ApiError("EMAIL_TAKEN", "A user with this email already exists", 409);
  }

  const superAdminRoleId = await ensureRolesAndPermissions(prisma);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(input.password),
      fullName: input.fullName.trim(),
      roleId: superAdminRoleId,
    },
  });
  await writeAudit(
    prisma,
    { userId: user.id, role: "SUPER_ADMIN", permissions: [] },
    { action: "auth.setup", module: "auth", recordId: user.id },
    req,
  );
  return { id: user.id, email: user.email, fullName: user.fullName };
}
