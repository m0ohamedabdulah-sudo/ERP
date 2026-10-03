/**
 * Compliance controller — thin HTTP layer.
 * Parses input, enforces permissions, delegates to the service.
 * No business logic here.
 *
 * Permissions:
 *   compliance.view   — reads (types, documents, summaries)
 *   compliance.manage — document-type CRUD, document writes, sweep
 *   compliance.verify — verify endpoint
 *   compliance.override — checked by the recruitment service (seed only)
 */
import { ok, paginated } from "../../lib/api-response";
import { requirePermission } from "../../lib/auth";
import { pageMeta } from "../../lib/pagination";
import { routeParam } from "../../lib/route-params";
import {
  createDocumentTypeSchema,
  documentQuerySchema,
  documentTypeQuerySchema,
  patchCandidateDocumentSchema,
  patchEmployeeDocumentSchema,
  updateDocumentTypeSchema,
  upsertCandidateDocumentSchema,
  upsertEmployeeDocumentSchema,
} from "./compliance.schema";
import * as service from "./compliance.service";

type Ctx = unknown;

// ------------------------- Document types -------------------------

export async function listDocumentTypes(req: Request): Promise<Response> {
  await requirePermission(req, "compliance.view");
  const query = documentTypeQuerySchema.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  const { rows, total } = await service.listDocumentTypes(query);
  return paginated(rows, pageMeta(query.page, query.pageSize, total));
}

export async function getDocumentType(req: Request, ctx: Ctx): Promise<Response> {
  await requirePermission(req, "compliance.view");
  const id = await routeParam(ctx, "id");
  return ok(await service.getDocumentType(id));
}

export async function createDocumentType(req: Request): Promise<Response> {
  const actor = await requirePermission(req, "compliance.manage");
  const input = createDocumentTypeSchema.parse(await req.json());
  return ok(await service.createDocumentType(actor, input, req), undefined, 201);
}

export async function updateDocumentType(
  req: Request,
  ctx: Ctx,
): Promise<Response> {
  const actor = await requirePermission(req, "compliance.manage");
  const id = await routeParam(ctx, "id");
  const input = updateDocumentTypeSchema.parse(await req.json());
  return ok(await service.updateDocumentType(actor, id, input, req));
}

export async function deleteDocumentType(
  req: Request,
  ctx: Ctx,
): Promise<Response> {
  const actor = await requirePermission(req, "compliance.manage");
  const id = await routeParam(ctx, "id");
  return ok(await service.deleteDocumentType(actor, id, req));
}

// ------------------------- Candidate documents -------------------------

export async function listCandidateDocuments(
  req: Request,
  ctx: Ctx,
): Promise<Response> {
  await requirePermission(req, "compliance.view");
  const candidateId = await routeParam(ctx, "candidateId");
  return ok(await service.listCandidateDocuments(candidateId));
}

export async function upsertCandidateDocument(
  req: Request,
  ctx: Ctx,
): Promise<Response> {
  const actor = await requirePermission(req, "compliance.manage");
  const candidateId = await routeParam(ctx, "candidateId");
  const input = upsertCandidateDocumentSchema.parse(await req.json());
  return ok(await service.upsertCandidateDocument(actor, candidateId, input, req));
}

export async function patchCandidateDocument(
  req: Request,
  ctx: Ctx,
): Promise<Response> {
  const actor = await requirePermission(req, "compliance.manage");
  const docId = await routeParam(ctx, "docId");
  const input = patchCandidateDocumentSchema.parse(await req.json());
  return ok(await service.updateCandidateDocumentById(actor, docId, input, req));
}

export async function deleteCandidateDocument(
  req: Request,
  ctx: Ctx,
): Promise<Response> {
  const actor = await requirePermission(req, "compliance.manage");
  const docId = await routeParam(ctx, "docId");
  return ok(await service.deleteCandidateDocument(actor, docId, req));
}

// ------------------------- Employee documents -------------------------

export async function listEmployeeDocuments(
  req: Request,
  ctx: Ctx,
): Promise<Response> {
  await requirePermission(req, "compliance.view");
  const employeeId = await routeParam(ctx, "employeeId");
  const query = documentQuerySchema.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  const { rows, total } = await service.listEmployeeDocuments({
    ...query,
    employeeId,
  });
  return paginated(rows, pageMeta(query.page, query.pageSize, total));
}

export async function upsertEmployeeDocument(
  req: Request,
  ctx: Ctx,
): Promise<Response> {
  const actor = await requirePermission(req, "compliance.manage");
  const employeeId = await routeParam(ctx, "employeeId");
  const input = upsertEmployeeDocumentSchema.parse(await req.json());
  return ok(await service.upsertEmployeeDocument(actor, employeeId, input, req));
}

export async function patchEmployeeDocument(
  req: Request,
  ctx: Ctx,
): Promise<Response> {
  const actor = await requirePermission(req, "compliance.manage");
  const docId = await routeParam(ctx, "docId");
  const input = patchEmployeeDocumentSchema.parse(await req.json());
  return ok(await service.updateEmployeeDocumentById(actor, docId, input, req));
}

export async function deleteEmployeeDocument(
  req: Request,
  ctx: Ctx,
): Promise<Response> {
  const actor = await requirePermission(req, "compliance.manage");
  const docId = await routeParam(ctx, "docId");
  return ok(await service.deleteEmployeeDocument(actor, docId, req));
}

export async function verifyEmployeeDocument(
  req: Request,
  ctx: Ctx,
): Promise<Response> {
  const actor = await requirePermission(req, "compliance.verify");
  const docId = await routeParam(ctx, "docId");
  return ok(await service.verifyDocument(actor, "employee", docId, req));
}

// ------------------------- Summaries / sweep -------------------------

export async function getEmployeeSummary(
  req: Request,
  ctx: Ctx,
): Promise<Response> {
  await requirePermission(req, "compliance.view");
  const employeeId = await routeParam(ctx, "employeeId");
  return ok(await service.getEmployeeComplianceSummary(employeeId));
}

export async function getSiteSummary(req: Request, ctx: Ctx): Promise<Response> {
  await requirePermission(req, "compliance.view");
  const siteId = await routeParam(ctx, "siteId");
  return ok(await service.getSiteComplianceSummary(siteId));
}

export async function sweep(req: Request): Promise<Response> {
  const actor = await requirePermission(req, "compliance.manage");
  return ok(await service.flagExpiringDocuments(actor, req));
}

export const complianceController = {
  listDocumentTypes,
  getDocumentType,
  createDocumentType,
  updateDocumentType,
  deleteDocumentType,
  listCandidateDocuments,
  upsertCandidateDocument,
  patchCandidateDocument,
  deleteCandidateDocument,
  listEmployeeDocuments,
  upsertEmployeeDocument,
  patchEmployeeDocument,
  deleteEmployeeDocument,
  verifyEmployeeDocument,
  getEmployeeSummary,
  getSiteSummary,
  sweep,
};
