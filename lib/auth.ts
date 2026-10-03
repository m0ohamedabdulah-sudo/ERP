/**
 * Identity + RBAC for API routes.
 *
 * Every route handler calls `requirePermission(req, "<module>.<action>")`
 * before touching the service layer. The API is the enforcement point;
 * the frontend only hides UI by permission.
 *
 * Identity resolution order:
 *  1. If `ALLOW_DEV_ACTOR=true`, the `x-dev-actor` header may carry a
 *     role name (e.g. `SUPER_ADMIN`); permissions are read from the DB
 *     for that role. Local dev / API contract tests ONLY — never enable
 *     in production.
 *  2. Session cookie (`er_access`): short-lived JWT → user → role →
 *     permission lookup. Inactive or soft-deleted users resolve to
 *     null (unauthenticated).
 *  3. Otherwise the request is unauthenticated → 401.
 */
import { prisma } from "./prisma";
import { ApiError } from "./api-response";
import { verifyAccessToken } from "./jwt";

export const ACCESS_COOKIE = "er_access";
export const REFRESH_COOKIE = "er_refresh";

export interface Actor {
  userId: string | null;
  role: string;
  permissions: string[];
}

/** Read a cookie value from a Request's Cookie header. */
export function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

async function resolveDevActor(req: Request): Promise<Actor | null> {
  const roleName = req.headers.get("x-dev-actor") ?? "SUPER_ADMIN";
  const role = await prisma.role.findUnique({
    where: { name: roleName },
    include: {
      rolePermissions: { include: { permission: true } },
    },
  });
  if (!role) return null;
  return {
    userId: null,
    role: role.name,
    permissions: role.rolePermissions.map((rp) => rp.permission.key),
  };
}

async function resolveSessionActor(req: Request): Promise<Actor | null> {
  const token = getCookie(req, ACCESS_COOKIE);
  if (!token) return null;
  let userId: string;
  try {
    userId = (await verifyAccessToken(token)).sub;
  } catch {
    return null; // expired / tampered / wrong kind
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: { include: { rolePermissions: { include: { permission: true } } } },
    },
  });
  if (!user || !user.isActive || user.deletedAt) return null;
  return {
    userId: user.id,
    role: user.role.name,
    permissions: user.role.rolePermissions.map((rp) => rp.permission.key),
  };
}

async function resolveActor(req: Request): Promise<Actor | null> {
  if (process.env.ALLOW_DEV_ACTOR === "true") {
    return resolveDevActor(req);
  }
  return resolveSessionActor(req);
}

/** Return the actor or null when unauthenticated. */
export async function getActor(req: Request): Promise<Actor | null> {
  return resolveActor(req);
}

/**
 * Enforce a permission. Throws ApiError(401) when unauthenticated,
 * ApiError(403) when the permission is missing.
 */
export async function requirePermission(
  req: Request,
  permissionKey: string,
): Promise<Actor> {
  const actor = await resolveActor(req);
  if (!actor) {
    throw new ApiError("UNAUTHENTICATED", "Authentication required", 401);
  }
  if (!actor.permissions.includes(permissionKey)) {
    throw new ApiError(
      "FORBIDDEN",
      `Missing permission: ${permissionKey}`,
      403,
    );
  }
  return actor;
}
