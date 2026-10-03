/**
 * Contract controller — thin HTTP layer.
 * Parses input, enforces permissions, delegates to the service.
 * No business logic here.
 */
import { ok, paginated } from "../../lib/api-response";
import { requirePermission } from "../../lib/auth";
import { pageMeta } from "../../lib/pagination";
import { routeParam } from "../../lib/route-params";
import {
  addRateSchema,
  addSiteSchema,
  contractQuerySchema,
  createContractSchema,
  statusTransitionSchema,
  updateContractSchema,
} from "./contract.schema";
import * as service from "./contract.service";

type Ctx = unknown;

export async function list(req: Request): Promise<Response> {
  await requirePermission(req, "contracts.view");
  const query = contractQuerySchema.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  const { rows, total } = await service.listContracts({
    page: query.page,
    pageSize: query.pageSize,
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
    search: query.search,
    status: query.status,
    clientId: query.clientId,
  });
  return paginated(rows, pageMeta(query.page, query.pageSize, total));
}

export async function get(req: Request, ctx: Ctx): Promise<Response> {
  await requirePermission(req, "contracts.view");
  const id = await routeParam(ctx, "id");
  return ok(await service.getContract(id));
}

export async function create(req: Request): Promise<Response> {
  const actor = await requirePermission(req, "contracts.create");
  const input = createContractSchema.parse(await req.json());
  return ok(await service.createContract(actor, input, req), undefined, 201);
}

export async function update(req: Request, ctx: Ctx): Promise<Response> {
  const actor = await requirePermission(req, "contracts.edit");
  const id = await routeParam(ctx, "id");
  const input = updateContractSchema.parse(await req.json());
  return ok(await service.updateContract(actor, id, input, req));
}

export async function remove(req: Request, ctx: Ctx): Promise<Response> {
  const actor = await requirePermission(req, "contracts.delete");
  const id = await routeParam(ctx, "id");
  return ok(await service.deleteContract(actor, id, req));
}

export async function transition(req: Request, ctx: Ctx): Promise<Response> {
  const actor = await requirePermission(req, "contracts.edit");
  const id = await routeParam(ctx, "id");
  const { to } = statusTransitionSchema.parse(await req.json());
  return ok(await service.transitionStatus(actor, id, to, req));
}

export async function addSite(req: Request, ctx: Ctx): Promise<Response> {
  const actor = await requirePermission(req, "contracts.create");
  const id = await routeParam(ctx, "id");
  const input = addSiteSchema.parse(await req.json());
  return ok(await service.addSite(actor, id, input, req), undefined, 201);
}

export async function removeSite(req: Request, ctx: Ctx): Promise<Response> {
  const actor = await requirePermission(req, "contracts.edit");
  const contractSiteId = await routeParam(ctx, "contractSiteId");
  return ok(await service.removeSite(actor, contractSiteId, req));
}

export async function addRate(req: Request, ctx: Ctx): Promise<Response> {
  const actor = await requirePermission(req, "contracts.create");
  const contractSiteId = await routeParam(ctx, "contractSiteId");
  const input = addRateSchema.parse(await req.json());
  return ok(await service.addRate(actor, contractSiteId, input, req), undefined, 201);
}

export async function removeRate(req: Request, ctx: Ctx): Promise<Response> {
  const actor = await requirePermission(req, "contracts.edit");
  const rateId = await routeParam(ctx, "rateId");
  return ok(await service.removeRate(actor, rateId, req));
}

export async function refreshExpiry(req: Request): Promise<Response> {
  const actor = await requirePermission(req, "contracts.edit");
  return ok(await service.refreshExpiry(actor, req));
}

export const contractController = {
  list,
  get,
  create,
  update,
  remove,
  transition,
  addSite,
  removeSite,
  addRate,
  removeRate,
  refreshExpiry,
};
