-- Roster permissions: upsert into the catalog and grant to operational roles.
-- (bootstrap.ts ensureRolesAndPermissions covers fresh setups; this covers
-- existing databases.)

-- Ensure the UUID generator exists (0001_init creates it, but be explicit).
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO "Permission" ("id", "key", "module", "description", "createdAt")
VALUES
  (gen_random_uuid(), 'roster.view', 'roster', 'View rosters and shifts', now()),
  (gen_random_uuid(), 'roster.manage', 'roster', 'Create and publish rosters, manage shifts', now())
ON CONFLICT ("key") DO NOTHING;

-- Grant both permissions to the operational roles (SUPER_ADMIN gets everything).
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), r."id", p."id", now()
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."name" IN ('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'SITE_MANAGER', 'SUPERVISOR')
  AND p."key" IN ('roster.view', 'roster.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
