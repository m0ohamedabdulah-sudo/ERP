import { ok, paginated } from "../../lib/api-response";
import { requirePermission } from "../../lib/auth";
import { routeParam } from "../../lib/route-params";
import {
  clientQuerySchema,
  createClientSchema,
  updateClientSchema,
} from "./client.schema";
import {
  listClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
} from "./client.service";

/**
 * Thin HTTP adapter for the clients module: permission checks,
 * input parsing, service calls, response formatting. No business
 * logic and no Prisma here.
 */

export async function list(req: Request, _ctx?: unknown): Promise<Response> {
  await requirePermission(req, "clients.view");
  const url = new URL(req.url);
  const query = clientQuerySchema.parse({
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  const result = await listClients(query);
  return paginated(result.data, result.page);
}

export async function get(req: Request, ctx?: unknown): Promise<Response> {
  await requirePermission(req, "clients.view");
  const id = await routeParam(ctx, "id");
  const client = await getClient(id);
  return ok(client);
}

export async function create(req: Request, _ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "clients.create");
  const input = createClientSchema.parse(await req.json());
  const client = await createClient(actor, input, req);
  return ok(client, undefined, 201);
}

export async function update(req: Request, ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "clients.edit");
  const id = await routeParam(ctx, "id");
  const input = updateClientSchema.parse(await req.json());
  const client = await updateClient(actor, id, input, req);
  return ok(client);
}

export async function remove(req: Request, ctx?: unknown): Promise<Response> {
  const actor = await requirePermission(req, "clients.delete");
  const id = await routeParam(ctx, "id");
  await deleteClient(actor, id, req);
  return ok({ deleted: true });
}
