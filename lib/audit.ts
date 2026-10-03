import type { PrismaClient, Prisma } from "@prisma/client";
import type { Actor } from "./auth";

/**
 * Audit logging. Every mutation in the new ERP modules writes one
 * AuditLog row via this helper — never write AuditLog rows inline.
 *
 * Accepts the root client or a transaction client so the audit row is
 * committed atomically with the mutation itself.
 */
export type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditEntry {
  action: string; // e.g. "client.create"
  module: string; // e.g. "clients"
  recordId?: string;
  oldValue?: unknown;
  newValue?: unknown;
}

function clientIp(req?: Request): string | undefined {
  if (!req) return undefined;
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || undefined;
}

export async function writeAudit(
  db: Db,
  actor: Actor | null,
  entry: AuditEntry,
  req?: Request,
): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: actor?.userId ?? null,
      action: entry.action,
      module: entry.module,
      recordId: entry.recordId,
      oldValue:
        entry.oldValue === undefined
          ? undefined
          : (entry.oldValue as Prisma.InputJsonValue),
      newValue:
        entry.newValue === undefined
          ? undefined
          : (entry.newValue as Prisma.InputJsonValue),
      ip: clientIp(req),
      userAgent: req?.headers.get("user-agent") ?? undefined,
    },
  });
}
