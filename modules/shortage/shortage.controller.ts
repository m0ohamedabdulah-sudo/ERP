import { ok } from "../../lib/api-response";
import { requireCatalogPermission } from "../../lib/catalog-sync";
import {
  replacementsQuerySchema,
  shortageQuerySchema,
} from "./shortage.schema";
import {
  computeShortages,
  getReplacementCandidates,
} from "./shortage.service";

/** Thin HTTP adapter for the shortage engine. */

export async function list(req: Request): Promise<Response> {
  const actor = await requireCatalogPermission(req, "shortage.view");
  const url = new URL(req.url);
  const input = shortageQuerySchema.parse({
    date: url.searchParams.get("date") ?? undefined,
    siteId: url.searchParams.get("siteId") ?? undefined,
    sectorId: url.searchParams.get("sectorId") ?? undefined,
  });
  return ok(await computeShortages(actor, input));
}

export async function replacements(req: Request): Promise<Response> {
  const actor = await requireCatalogPermission(req, "shortage.view");
  const url = new URL(req.url);
  const input = replacementsQuerySchema.parse({
    date: url.searchParams.get("date") ?? undefined,
    siteId: url.searchParams.get("siteId") ?? undefined,
    shiftId: url.searchParams.get("shiftId") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  return ok(await getReplacementCandidates(actor, input));
}
