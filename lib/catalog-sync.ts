import { requirePermission, type Actor } from "./auth";
import { ensureRolesAndPermissions } from "./bootstrap";
import { prisma } from "./prisma";

/**
 * Ensure the permission catalog is synced before checking permissions.
 * New permission keys are added to lib/bootstrap.ts; data migrations for
 * seeding them fail on Neon, so controllers sync lazily via Prisma upserts
 * (once per server instance, memoized).
 */
let catalogSync: Promise<string> | null = null;

export async function ensurePermissionCatalog(): Promise<void> {
  if (!catalogSync) {
    catalogSync = ensureRolesAndPermissions(prisma).catch((err: unknown) => {
      catalogSync = null; // allow retry on the next request
      throw err;
    });
  }
  await catalogSync;
}

/** requirePermission, but syncs the catalog first. */
export async function requireCatalogPermission(
  req: Request,
  permission: string,
): Promise<Actor> {
  await ensurePermissionCatalog();
  return requirePermission(req, permission);
}
