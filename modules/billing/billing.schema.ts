/**
 * Billing Zod schemas (modules/billing/billing.schema.ts).
 *
 * Date handling: billing works on calendar days. Date inputs arrive as
 * "YYYY-MM-DD" strings and are transformed into local-midnight Dates
 * (via parseDateOnly) so @db.Date columns never shift across timezones.
 */

import { z } from "zod";
import { InvoiceStatus, PaymentMethod } from "@prisma/client";

/**
 * Parse "YYYY-MM-DD" into a local-midnight Date (new Date(y, m-1, d)).
 * Throws on malformed input or impossible calendar dates (e.g. 2026-02-30).
 */
export function parseDateOnly(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) {
    throw new Error(`Invalid date (expected YYYY-MM-DD): ${s}`);
  }
  const y = Number(m[1] ?? "");
  const mo = Number(m[2] ?? "");
  const d = Number(m[3] ?? "");
  const dt = new Date(y, mo - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    throw new Error(`Invalid calendar date: ${s}`);
  }
  return dt;
}

/** "YYYY-MM-DD" string → local-midnight Date. Optional variant via .optional(). */
const dateOnlyField = (fieldName: string) =>
  z
    .string()
    .superRefine((s, ctx) => {
      try {
        parseDateOnly(s);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${fieldName} must be a valid YYYY-MM-DD date`,
        });
      }
    })
    .transform((s) => parseDateOnly(s));

// ------------------------------------------------------------------
// POST /api/v1/invoices — generate a draft invoice from attendance
// ------------------------------------------------------------------

export const generateInvoiceSchema = z
  .object({
    contractId: z.string().uuid(),
    periodStart: dateOnlyField("periodStart"),
    periodEnd: dateOnlyField("periodEnd"),
    taxRate: z.number().min(0).max(1).default(0),
    discountAmount: z.number().min(0).default(0),
  })
  .refine((v) => v.periodStart.getTime() <= v.periodEnd.getTime(), {
    message: "periodStart must be on or before periodEnd",
    path: ["periodEnd"],
  });

export type GenerateInvoiceInput = z.infer<typeof generateInvoiceSchema>;

// ------------------------------------------------------------------
// GET /api/v1/invoices — list filters
// ------------------------------------------------------------------

export const invoiceQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .transform((v) => Math.min(v, 100))
    .default(20),
  clientId: z.string().uuid().optional(),
  contractId: z.string().uuid().optional(),
  status: z.nativeEnum(InvoiceStatus).optional(),
  from: dateOnlyField("from").optional(),
  to: dateOnlyField("to").optional(),
});

export type InvoiceQueryInput = z.infer<typeof invoiceQuerySchema>;

// ------------------------------------------------------------------
// POST /api/v1/invoices/:id/payments — record a payment
// ------------------------------------------------------------------

export const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  paidAt: dateOnlyField("paidAt"),
  method: z.nativeEnum(PaymentMethod),
  reference: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

// ------------------------------------------------------------------
// POST /api/v1/invoices/:id/transition — status transitions
// (recalculate has its own endpoint)
// ------------------------------------------------------------------

export const invoiceTransitionSchema = z.object({
  transition: z.enum(["issue", "send", "cancel"]),
});

export type InvoiceTransitionInput = z.infer<typeof invoiceTransitionSchema>;
