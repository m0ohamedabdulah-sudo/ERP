import { z } from "zod";
import { PayrollAdjustmentKind, PayoutMethod } from "@prisma/client";

/**
 * Input validation for the payroll module.
 *
 * Payroll is computed natively from the ERP data model:
 * attendance codes (weighted dayValue) × salary-derived daily rate,
 * plus manual financial effects (fines, cuts, advances, bonuses).
 */

export const generatePayrollSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

export type GeneratePayrollInput = z.infer<typeof generatePayrollSchema>;

export const reportQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  siteId: z.string().uuid().optional(),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;

export const createAdjustmentSchema = z.object({
  employeeId: z.string().uuid("Invalid employee"),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  kind: z.nativeEnum(PayrollAdjustmentKind),
  amount: z.number().positive("Amount must be positive"),
  notes: z.string().max(500).optional(),
});

export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;

export const adjustmentQuerySchema = z.object({
  employeeId: z.string().uuid(),
  year: z.coerce.number().int(),
  month: z.coerce.number().int().min(1).max(12),
});

export type AdjustmentQuery = z.infer<typeof adjustmentQuerySchema>;

export const payoutMethodSchema = z.object({
  payoutMethod: z.nativeEnum(PayoutMethod),
  bankAccount: z.string().max(64).optional(),
});

export type PayoutMethodInput = z.infer<typeof payoutMethodSchema>;
