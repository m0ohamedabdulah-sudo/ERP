/**
 * Recruitment controller — thin HTTP layer.
 * Parses input, enforces permissions, delegates to the service.
 * No business logic here.
 */
import { ok, paginated } from "../../lib/api-response";
import { requirePermission } from "../../lib/auth";
import { pageMeta } from "../../lib/pagination";
import { routeParam } from "../../lib/route-params";
import {
  candidateQuerySchema,
  createCandidateSchema,
  hireCandidateSchema,
  scheduleInterviewSchema,
  statusTransitionSchema,
  updateCandidateSchema,
  updateInterviewSchema,
} from "./recruitment.schema";
import * as service from "./recruitment.service";

type Ctx = unknown;

export async function list(req: Request): Promise<Response> {
  await requirePermission(req, "recruitment.view");
  const query = candidateQuerySchema.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  const { rows, total } = await service.listCandidates({
    page: query.page,
    pageSize: query.pageSize,
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
    search: query.search,
    status: query.status,
    siteId: query.siteId,
  });
  return paginated(rows, pageMeta(query.page, query.pageSize, total));
}

export async function pipeline(req: Request): Promise<Response> {
  await requirePermission(req, "recruitment.view");
  return ok(await service.getPipeline());
}

export async function get(req: Request, ctx: Ctx): Promise<Response> {
  await requirePermission(req, "recruitment.view");
  const id = await routeParam(ctx, "id");
  return ok(await service.getCandidate(id));
}

export async function create(req: Request): Promise<Response> {
  const actor = await requirePermission(req, "recruitment.create");
  const input = createCandidateSchema.parse(await req.json());
  return ok(await service.createCandidate(actor, input, req), undefined, 201);
}

export async function update(req: Request, ctx: Ctx): Promise<Response> {
  const actor = await requirePermission(req, "recruitment.edit");
  const id = await routeParam(ctx, "id");
  const input = updateCandidateSchema.parse(await req.json());
  return ok(await service.updateCandidate(actor, id, input, req));
}

export async function remove(req: Request, ctx: Ctx): Promise<Response> {
  const actor = await requirePermission(req, "recruitment.delete");
  const id = await routeParam(ctx, "id");
  return ok(await service.deleteCandidate(actor, id, req));
}

export async function transition(req: Request, ctx: Ctx): Promise<Response> {
  const actor = await requirePermission(req, "recruitment.edit");
  const id = await routeParam(ctx, "id");
  const { to } = statusTransitionSchema.parse(await req.json());
  return ok(await service.transitionStatus(actor, id, to, req));
}

export async function hire(req: Request, ctx: Ctx): Promise<Response> {
  const actor = await requirePermission(req, "recruitment.hire");
  const id = await routeParam(ctx, "id");
  const input = hireCandidateSchema.parse(await req.json());
  return ok(await service.hireCandidate(actor, id, input, req), undefined, 201);
}

export async function listInterviews(
  req: Request,
  ctx: Ctx,
): Promise<Response> {
  await requirePermission(req, "recruitment.view");
  const id = await routeParam(ctx, "id");
  return ok(await service.listInterviews(id));
}

export async function scheduleInterview(
  req: Request,
  ctx: Ctx,
): Promise<Response> {
  const actor = await requirePermission(req, "recruitment.edit");
  const id = await routeParam(ctx, "id");
  const input = scheduleInterviewSchema.parse(await req.json());
  return ok(
    await service.scheduleInterview(actor, id, input, req),
    undefined,
    201,
  );
}

export async function updateInterview(
  req: Request,
  ctx: Ctx,
): Promise<Response> {
  const actor = await requirePermission(req, "recruitment.edit");
  const interviewId = await routeParam(ctx, "interviewId");
  const input = updateInterviewSchema.parse(await req.json());
  return ok(await service.updateInterview(actor, interviewId, input, req));
}

export async function deleteInterview(
  req: Request,
  ctx: Ctx,
): Promise<Response> {
  const actor = await requirePermission(req, "recruitment.edit");
  const interviewId = await routeParam(ctx, "interviewId");
  return ok(await service.deleteInterview(actor, interviewId, req));
}

export const recruitmentController = {
  list,
  pipeline,
  get,
  create,
  update,
  remove,
  transition,
  hire,
  listInterviews,
  scheduleInterview,
  updateInterview,
  deleteInterview,
};
