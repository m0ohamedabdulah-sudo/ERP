import { ok } from "../../lib/api-response";
import { requirePermission } from "../../lib/auth";
import { financeQuerySchema, operationsQuerySchema } from "./analytics.schema";
import { getFinance, getHr, getOperations } from "./analytics.service";

/** Thin HTTP adapter for analytics (read-only, reports.view). */

export async function operations(req: Request): Promise<Response> {
  await requirePermission(req, "reports.view");
  const url = new URL(req.url);
  const query = operationsQuerySchema.parse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    siteId: url.searchParams.get("siteId") ?? undefined,
  });
  return ok(await getOperations(query));
}

export async function finance(req: Request): Promise<Response> {
  await requirePermission(req, "reports.view");
  const url = new URL(req.url);
  const query = financeQuerySchema.parse({
    months: url.searchParams.get("months") ?? undefined,
  });
  return ok(await getFinance(query));
}

export async function hr(req: Request): Promise<Response> {
  await requirePermission(req, "reports.view");
  return ok(await getHr());
}
