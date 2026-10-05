import { z } from "zod";

/** Input validation for analytics queries. */

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const operationsQuerySchema = z.object({
  from: dateString,
  to: dateString,
  siteId: z.string().uuid().optional(),
}).refine((v) => v.to >= v.from, {
  message: "to must be on or after from",
  path: ["to"],
});

export type OperationsQuery = z.infer<typeof operationsQuerySchema>;

export const financeQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
});

export type FinanceQuery = z.infer<typeof financeQuerySchema>;
