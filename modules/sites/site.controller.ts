import { ok, paginated } from "../../lib/api-response";
import { requirePermission } from "../../lib/auth";
import { routeParam } from "../../lib/route-params";
import {
  siteQuerySchema,
  createSiteSchema,
  updateSiteSchema,
} from "./site.schema";
import {
  listSites,
  getSite,
  createSite,
  updateSite,
  deleteSite,
} from "./site.service";

/**
 * Thin HTTP adapter for the sites module: permission checks,
 * input parsing, service calls, response formatting. No business
 * logic and no Prisma here.
 */

export async function list(req: Request, _ctx?: unknown): Promise<Response> {
  await requirePermission(req, "sites.view");
  const url = new URL(req.url);
  const query = siteQuerySchema.parse({
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
    sectorId: url.searchParams.get("sectorId") ?? undefined,
    isActive: url.searchParams.get("isActive") ?? undefined,
  });
  const result = await listSites(query);
  return paginated(result.data, result.page);
}

export async function get(req: Request, ctx?: unknown): Promise<Response> {
  await requirePermission(req, "sites.view");
  const id = await routeParam(ctx, "id");
  const site = await getSite(id);
  return ok(site);
}

export async function create(req: Request, _ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "sites.manage");
  const input = createSiteSchema.parse(await req.json());
  const site = await createSite(actor, input, req);
  return ok(site, undefined, 201);
}

export async function update(req: Request, ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "sites.manage");
  const id = await routeParam(ctx, "id");
  const input = updateSiteSchema.parse(await req.json());
  const site = await updateSite(actor, id, input, req);
  return ok(site);
}

export async function remove(req: Request, ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "sites.manage");
  const id = await routeParam(ctx, "id");
  await deleteSite(actor, id, req);
  return ok({ deleted: true });
}
