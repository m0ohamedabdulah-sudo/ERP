import { ok, withErrors } from "../../../../lib/api-response";
import { prisma } from "../../../../lib/prisma";

/**
 * Public liveness/readiness probe (docs/DEPLOYMENT.md §8).
 *
 * Unauthenticated by design: orchestrators and load balancers call this
 * without a user session. It only reports DB reachability and process
 * uptime — no business data, no secrets.
 */
async function health(): Promise<Response> {
  await prisma.$queryRaw`SELECT 1`;
  return ok({
    db: "ok",
    uptime: Math.floor(process.uptime()),
  });
}

export const dynamic = "force-dynamic";

export const GET = withErrors(health);
