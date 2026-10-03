/**
 * Billing controller (modules/billing/billing.controller.ts).
 *
 * Thin: auth (requirePermission) + Zod parsing, then delegate to the
 * service. No business logic, no Prisma here.
 *
 * Permissions:
 * - invoices.view     → list, get
 * - payments.view     → listPayments
 * - invoices.create   → generate
 * - invoices.manage   → recalculate, transition, submitEinvoice, refreshOverdue
 * - payments.create   → recordPayment
 */

import { ok, paginated } from "../../lib/api-response";
import { requirePermission } from "../../lib/auth";
import { pageMeta } from "../../lib/pagination";
import { routeParam } from "../../lib/route-params";
import {
  generateInvoiceSchema,
  invoiceQuerySchema,
  invoiceTransitionSchema,
  recordPaymentSchema,
} from "./billing.schema";
import * as service from "./billing.service";

export async function generate(req: Request): Promise<Response> {
  const actor = await requirePermission(req, "invoices.create");
  const input = generateInvoiceSchema.parse(await req.json());
  const dto = await service.generateDraftInvoice(actor, input, req);
  return ok(dto, undefined, 201);
}

export async function list(req: Request): Promise<Response> {
  await requirePermission(req, "invoices.view");
  const query = invoiceQuerySchema.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  const { rows, page, pageSize, total } = await service.listInvoices(query);
  return paginated(rows, pageMeta(page, pageSize, total));
}

export async function get(req: Request, ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "invoices.view");
  const id = await routeParam(ctx, "id");
  return ok(await service.getInvoice(actor, id, req));
}

export async function recalculate(
  req: Request,
  ctx?: unknown,
): Promise<Response> {
  const actor = await requirePermission(req, "invoices.manage");
  const id = await routeParam(ctx, "id");
  return ok(await service.recalculateInvoice(actor, id, req));
}

export async function transition(
  req: Request,
  ctx?: unknown,
): Promise<Response> {
  const actor = await requirePermission(req, "invoices.manage");
  const id = await routeParam(ctx, "id");
  const { transition } = invoiceTransitionSchema.parse(await req.json());
  return ok(await service.transitionInvoice(actor, id, transition, req));
}

export async function recordPayment(
  req: Request,
  ctx?: unknown,
): Promise<Response> {
  const actor = await requirePermission(req, "payments.create");
  const id = await routeParam(ctx, "id");
  const input = recordPaymentSchema.parse(await req.json());
  const result = await service.recordPayment(actor, id, input, req);
  return ok(result, undefined, 201);
}

export async function listPayments(
  req: Request,
  ctx?: unknown,
): Promise<Response> {
  await requirePermission(req, "payments.view");
  const id = await routeParam(ctx, "id");
  const payments = await service.listPayments(id);
  return ok({ invoiceId: id, payments });
}

export async function submitEinvoice(
  req: Request,
  ctx?: unknown,
): Promise<Response> {
  const actor = await requirePermission(req, "invoices.manage");
  const id = await routeParam(ctx, "id");
  return ok(await service.submitEinvoice(actor, id, req));
}

export async function refreshOverdue(req: Request): Promise<Response> {
  const actor = await requirePermission(req, "invoices.manage");
  return ok(await service.refreshOverdue(actor, req));
}
