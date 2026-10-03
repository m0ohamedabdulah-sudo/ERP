import { PrismaClient } from "@prisma/client";

/**
 * Shared Prisma client singleton (Next.js dev-server safe).
 *
 * Repositories accept this client or a transaction client — see the
 * `Db` type in each module's repository file.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
