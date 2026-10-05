import { ok, paginated } from "../../lib/api-response";
import { requirePermission } from "../../lib/auth";
import { routeParam } from "../../lib/route-params";
import { createShiftSchema, updateShiftSchema } from "./shift.schema";
import {
  createRosterSchema,
  rosterQuerySchema,
  setAssignmentsSchema,
} from "./roster.schema";
import {
  listShifts,
  createShift,
  updateShift,
  deleteShift,
} from "./shift.service";
import {
  listRosters,
  getRoster,
  createRoster,
  setAssignments,
  publishRoster,
  deleteRoster,
} from "./roster.service";

/** Thin HTTP adapter for shifts + rosters. */

// --- Shifts (nested under sites) ---

export async function listSiteShifts(req: Request, ctx?: unknown): Promise<Response> {
  await requirePermission(req, "roster.view");
  const siteId = await routeParam(ctx, "id");
  return ok(await listShifts(siteId));
}

export async function createSiteShift(req: Request, ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "roster.manage");
  const siteId = await routeParam(ctx, "id");
  const input = createShiftSchema.parse(await req.json());
  return ok(await createShift(actor, siteId, input, req), undefined, 201);
}

export async function updateOneShift(req: Request, ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "roster.manage");
  const id = await routeParam(ctx, "id");
  const input = updateShiftSchema.parse(await req.json());
  return ok(await updateShift(actor, id, input, req));
}

export async function deleteOneShift(req: Request, ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "roster.manage");
  const id = await routeParam(ctx, "id");
  await deleteShift(actor, id, req);
  return ok({ deleted: true });
}

// --- Rosters ---

export async function list(req: Request, _ctx?: unknown): Promise<Response> {
  await requirePermission(req, "roster.view");
  const url = new URL(req.url);
  const query = rosterQuerySchema.parse({
    siteId: url.searchParams.get("siteId") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });
  const result = await listRosters(query);
  return paginated(result.data, result.page);
}

export async function get(req: Request, ctx?: unknown): Promise<Response> {
  await requirePermission(req, "roster.view");
  const id = await routeParam(ctx, "id");
  return ok(await getRoster(id));
}

export async function create(req: Request, _ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "roster.manage");
  const input = createRosterSchema.parse(await req.json());
  return ok(await createRoster(actor, input, req), undefined, 201);
}

export async function remove(req: Request, ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "roster.manage");
  const id = await routeParam(ctx, "id");
  await deleteRoster(actor, id, req);
  return ok({ deleted: true });
}

export async function saveAssignments(req: Request, ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "roster.manage");
  const id = await routeParam(ctx, "id");
  const input = setAssignmentsSchema.parse(await req.json());
  return ok(await setAssignments(actor, id, input, req));
}

export async function publish(req: Request, ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "roster.manage");
  const id = await routeParam(ctx, "id");
  return ok(await publishRoster(actor, id, req));
}
