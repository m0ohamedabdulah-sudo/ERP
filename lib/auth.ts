import { prisma } from "./prisma";
import { ApiError } from "./api-response";

/**
 * Identity + RBAC for API routes.
 *
 * Every route handler calls `requirePermission(req, "<module>.<action>")`
 * before touching the service layer. The API is the enforcement point;
 * the frontend only hides UI by permission.
 *
 * CURRENT STATE (Phase 0/1): the full JWT session auth described in
 * docs/ARCHITECTURE.md §5 is not built yet. Until it lands, identity is
 * resolved as follows:
 *
 *  1. If `ALLOW_DEV_ACTOR=true`, the `x-dev-actor` header may carry a
 *     role name (e.g. `SUPER_ADMIN`); permissions are read from the DB
 *     for that role. This is for local dev / API contract tests only.
 *  2. Otherwise the request is unauthenticated → 401.
 *
 * When the auth module lands, replace `resolveActor` internals with
 * session-cookie → user → role → permission lookup. Callers stay the
 * same.
 */

export interface Actor {
  userId: string | null;
  role: string;
  permissions: string[];
}

async function resolveActor(req: Request): Promise<Actor | null> {
  if (process.env.ALLOW_DEV_ACTOR === "true") {
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
  return null;
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
