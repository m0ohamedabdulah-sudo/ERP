import { ok, paginated } from "../../lib/api-response";
import { requireCatalogPermission } from "../../lib/catalog-sync";
import { routeParam } from "../../lib/route-params";
import {
  auditQuerySchema,
  createUserSchema,
  updateRolePermissionsSchema,
  updateUserSchema,
  userQuerySchema,
} from "./admin.schema";
import {
  createUser,
  getAuditLog,
  listAuditLogs,
  listPermissions,
  listRoles,
  listUsers,
  updateRolePermissions,
  updateUser,
} from "./admin.service";

/** Thin HTTP adapter for user/role/audit administration. */

export async function list(req: Request): Promise<Response> {
  await requireCatalogPermission(req, "users.view");
  const url = new URL(req.url);
  const query = userQuerySchema.parse({
    search: url.searchParams.get("search") ?? undefined,
    roleId: url.searchParams.get("roleId") ?? undefined,
    isActive: url.searchParams.get("isActive") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });
  const result = await listUsers(query);
  return paginated(result.data, result.page);
}

export async function create(req: Request): Promise<Response> {
  const actor = await requireCatalogPermission(req, "users.manage");
  const input = createUserSchema.parse(await req.json());
  return ok(await createUser(actor, input, req), undefined, 201);
}

export async function update(req: Request, ctx?: unknown): Promise<Response> {
  const actor = await requireCatalogPermission(req, "users.manage");
  const id = await routeParam(ctx, "id");
  const input = updateUserSchema.parse(await req.json());
  return ok(await updateUser(actor, id, input, req));
}

export async function roles(req: Request): Promise<Response> {
  await requireCatalogPermission(req, "users.view");
  return ok(await listRoles());
}

export async function permissions(req: Request): Promise<Response> {
  await requireCatalogPermission(req, "users.view");
  return ok(await listPermissions());
}

export async function updatePermissions(
  req: Request,
  ctx?: unknown,
): Promise<Response> {
  const actor = await requireCatalogPermission(req, "users.manage");
  const id = await routeParam(ctx, "id");
  const input = updateRolePermissionsSchema.parse(await req.json());
  return ok(await updateRolePermissions(actor, id, input.permissionIds, req));
}

export async function auditLogs(req: Request): Promise<Response> {
  await requireCatalogPermission(req, "audit.view");
  const url = new URL(req.url);
  const query = auditQuerySchema.parse({
    module: url.searchParams.get("module") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    userId: url.searchParams.get("userId") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });
  const result = await listAuditLogs(query);
  return paginated(result.data, result.page);
}

export async function auditLog(req: Request, ctx?: unknown): Promise<Response> {
  await requireCatalogPermission(req, "audit.view");
  const id = await routeParam(ctx, "id");
  return ok(await getAuditLog(id));
}
