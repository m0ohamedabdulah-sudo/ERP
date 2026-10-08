import { ok } from "../../lib/api-response";
import { requireCatalogPermission } from "../../lib/catalog-sync";
import { checkRateLimit, clientIp } from "../../lib/rate-limit";
import { ApiError } from "../../lib/api-response";
import { routeParam } from "../../lib/route-params";
import {
  manualCheckinSchema,
  qrCheckinSchema,
  qrCheckoutSchema,
  qrRotateQuerySchema,
} from "./operations.schema";
import {
  getLiveBoard,
  getOrRotateSiteQr,
  getTokenInfo,
  manualCheckin,
  qrCheckin,
  qrCheckout,
} from "./operations.service";

/** Thin HTTP adapter for the Operations Command Center. */

/** Token-gated public endpoints are brute-forceable — throttle per IP. */
function throttlePublic(req: Request): void {
  const res = checkRateLimit(`ops-checkin:${clientIp(req)}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!res.allowed) {
    throw new ApiError("RATE_LIMITED", "Too many attempts — try again shortly", 429);
  }
}

export async function checkin(req: Request): Promise<Response> {
  // Public: the QR token is the gate (guards have no login).
  throttlePublic(req);
  const input = qrCheckinSchema.parse(await req.json());
  return ok(await qrCheckin(null, input, req), undefined, 201);
}

export async function checkout(req: Request): Promise<Response> {
  // Public: the QR token is the gate.
  throttlePublic(req);
  const input = qrCheckoutSchema.parse(await req.json());
  return ok(await qrCheckout(null, input, req));
}

export async function tokenInfo(req: Request, ctx?: unknown): Promise<Response> {
  // Public: needed by the token-gated check-in page to show the site name.
  const token = await routeParam(ctx, "token");
  return ok(await getTokenInfo(token));
}

export async function manual(req: Request): Promise<Response> {
  const actor = await requireCatalogPermission(req, "checkin.manage");
  const input = manualCheckinSchema.parse(await req.json());
  return ok(await manualCheckin(actor, input, req));
}

export async function siteQr(req: Request, ctx?: unknown): Promise<Response> {
  const actor = await requireCatalogPermission(req, "checkin.qr");
  const siteId = await routeParam(ctx, "siteId");
  const url = new URL(req.url);
  const query = qrRotateQuerySchema.parse({
    rotate: url.searchParams.get("rotate") ?? undefined,
  });
  return ok(await getOrRotateSiteQr(actor, siteId, query.rotate ?? false, req));
}

export async function live(req: Request): Promise<Response> {
  const actor = await requireCatalogPermission(req, "operations.view");
  return ok(await getLiveBoard(actor));
}
