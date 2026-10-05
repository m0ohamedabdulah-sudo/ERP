import { ok } from "../../lib/api-response";
import { requirePermission } from "../../lib/auth";
import { routeParam } from "../../lib/route-params";
import {
  generatePayrollSchema,
  reportQuerySchema,
  createAdjustmentSchema,
  adjustmentQuerySchema,
  payoutMethodSchema,
} from "./payroll.schema";
import {
  generatePayroll,
  getPayrollReport,
  createAdjustment,
  listAdjustments,
  deleteAdjustment,
  finalizePayroll,
  setPayoutMethod,
} from "./payroll.service";

/**
 * Thin HTTP adapter for the payroll module: permission checks,
 * input parsing, service calls, response formatting. No business
 * logic and no Prisma here.
 */

export async function generate(req: Request, _ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "payroll.manage");
  const input = generatePayrollSchema.parse(await req.json());
  return ok(await generatePayroll(actor, input, req));
}

export async function report(req: Request, _ctx?: unknown): Promise<Response> {
  await requirePermission(req, "payroll.view");
  const url = new URL(req.url);
  const query = reportQuerySchema.parse({
    year: url.searchParams.get("year") ?? undefined,
    month: url.searchParams.get("month") ?? undefined,
    siteId: url.searchParams.get("siteId") ?? undefined,
  });
  return ok(await getPayrollReport(query));
}

export async function finalize(req: Request, _ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "payroll.manage");
  const input = generatePayrollSchema.parse(await req.json());
  return ok(await finalizePayroll(actor, input, req));
}

export async function listAdj(req: Request, _ctx?: unknown): Promise<Response> {
  await requirePermission(req, "payroll.view");
  const url = new URL(req.url);
  const query = adjustmentQuerySchema.parse({
    employeeId: url.searchParams.get("employeeId") ?? undefined,
    year: url.searchParams.get("year") ?? undefined,
    month: url.searchParams.get("month") ?? undefined,
  });
  return ok(await listAdjustments(query));
}

export async function createAdj(req: Request, _ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "payroll.manage");
  const input = createAdjustmentSchema.parse(await req.json());
  return ok(await createAdjustment(actor, input, req), undefined, 201);
}

export async function deleteAdj(req: Request, ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "payroll.manage");
  const id = await routeParam(ctx, "id");
  await deleteAdjustment(actor, id, req);
  return ok({ deleted: true });
}

export async function payout(req: Request, ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "payroll.manage");
  const id = await routeParam(ctx, "id");
  const input = payoutMethodSchema.parse(await req.json());
  await setPayoutMethod(actor, id, input.payoutMethod, input.bankAccount, req);
  return ok({ updated: true });
}
