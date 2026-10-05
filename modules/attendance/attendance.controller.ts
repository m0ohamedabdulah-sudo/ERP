import { ok } from "../../lib/api-response";
import { requirePermission } from "../../lib/auth";
import { boardQuerySchema, markAttendanceSchema } from "./attendance.schema";
import {
  listCodes,
  getBoard,
  markAttendance,
} from "./attendance.service";

/**
 * Thin HTTP adapter for the attendance module: permission checks,
 * input parsing, service calls, response formatting. No business
 * logic and no Prisma here.
 */

export async function codes(req: Request, _ctx?: unknown): Promise<Response> {
  await requirePermission(req, "attendance.view");
  return ok(await listCodes());
}

export async function board(req: Request, _ctx?: unknown): Promise<Response> {
  await requirePermission(req, "attendance.view");
  const url = new URL(req.url);
  const query = boardQuerySchema.parse({
    date: url.searchParams.get("date") ?? undefined,
    siteId: url.searchParams.get("siteId") ?? undefined,
  });
  return ok(await getBoard(query));
}

export async function mark(req: Request, _ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "attendance.edit");
  const input = markAttendanceSchema.parse(await req.json());
  const result = await markAttendance(actor, input, req);
  return ok(result, undefined, 201);
}
