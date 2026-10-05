import { ok } from "../../lib/api-response";
import { requirePermission } from "../../lib/auth";
import { createSectorSchema } from "./lookup.schema";
import { listSectors, createSector, listPositions } from "./lookup.service";

/** Thin HTTP adapter for form lookups. */

export async function sectors(req: Request, _ctx?: unknown): Promise<Response> {
  await requirePermission(req, "sites.view");
  return ok(await listSectors());
}

export async function createSectorEndpoint(
  req: Request,
  _ctx?: unknown,
): Promise<Response> {
  const actor = await requirePermission(req, "sites.manage");
  const input = createSectorSchema.parse(await req.json());
  const sector = await createSector(actor, input, req);
  return ok(sector, undefined, 201);
}

export async function positions(
  req: Request,
  _ctx?: unknown,
): Promise<Response> {
  await requirePermission(req, "employees.view");
  return ok(await listPositions());
}
