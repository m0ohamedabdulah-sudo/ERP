import { ok, paginated } from "../../lib/api-response";
import { requirePermission } from "../../lib/auth";
import { routeParam } from "../../lib/route-params";
import {
  employeeQuerySchema,
  createEmployeeSchema,
  updateEmployeeSchema,
} from "./employee.schema";
import {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from "./employee.service";

/**
 * Thin HTTP adapter for the employees module: permission checks,
 * input parsing, service calls, response formatting. No business
 * logic and no Prisma here.
 */

export async function list(req: Request, _ctx?: unknown): Promise<Response> {
  await requirePermission(req, "employees.view");
  const url = new URL(req.url);
  const query = employeeQuerySchema.parse({
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
    siteId: url.searchParams.get("siteId") ?? undefined,
    sectorId: url.searchParams.get("sectorId") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  const result = await listEmployees(query);
  return paginated(result.data, result.page);
}

export async function get(req: Request, ctx?: unknown): Promise<Response> {
  await requirePermission(req, "employees.view");
  const id = await routeParam(ctx, "id");
  const employee = await getEmployee(id);
  return ok(employee);
}

export async function create(req: Request, _ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "employees.create");
  const input = createEmployeeSchema.parse(await req.json());
  const employee = await createEmployee(actor, input, req);
  return ok(employee, undefined, 201);
}

export async function update(req: Request, ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "employees.edit");
  const id = await routeParam(ctx, "id");
  const input = updateEmployeeSchema.parse(await req.json());
  const employee = await updateEmployee(actor, id, input, req);
  return ok(employee);
}

export async function remove(req: Request, ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "employees.delete");
  const id = await routeParam(ctx, "id");
  await deleteEmployee(actor, id, req);
  return ok({ deleted: true });
}
