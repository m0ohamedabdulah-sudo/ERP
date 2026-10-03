/**
 * Contract Zod schemas — input validation for the contracts module.
 * Pure validation only; no Prisma, no I/O.
 */
import { z } from "zod";
import { ContractStatus, ServiceType } from "@prisma/client";

/**
 * Date-only string "YYYY-MM-DD" → Date at local midnight.
 * Rejects malformed strings AND non-existent calendar dates
 * (e.g. 2026-02-30, 2026-13-01).
 */
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected date in YYYY-MM-DD format")
  .superRefine((s, ctx) => {
    const parts = s.split("-").map(Number);
    const y = parts[0] ?? Number.NaN;
    const m = parts[1] ?? Number.NaN;
    const d = parts[2] ?? Number.NaN;
    const dt = new Date(`${s}T00:00:00`);
    if (
      Number.isNaN(dt.getTime()) ||
      dt.getFullYear() !== y ||
      dt.getMonth() + 1 !== m ||
      dt.getDate() !== d
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid calendar date",
      });
    }
  })
  .transform((s) => new Date(`${s}T00:00:00`));

const uuid = z.string().uuid();

export const rateInput = z
  .object({
    shiftId: uuid.nullish(),
    positionId: uuid.nullish(),
    ratePerShift: z.number().positive("ratePerShift must be positive"),
    ratePerMonth: z.number().positive().optional(),
    overtimeRatePerHour: z.number().positive().optional(),
    effectiveFrom: dateString,
    effectiveTo: dateString.nullish(),
  })
  .superRefine((v, ctx) => {
    if (
      v.effectiveTo != null &&
      v.effectiveTo.getTime() < v.effectiveFrom.getTime()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "effectiveTo must be on or after effectiveFrom",
        path: ["effectiveTo"],
      });
    }
  });

export const contractSiteInput = z.object({
  siteId: uuid,
  serviceType: z.nativeEnum(ServiceType),
  rates: z.array(rateInput).min(1, "Each contract site needs at least one rate"),
});

const contractBaseFields = {
  clientId: uuid,
  contractNo: z.string().trim().min(1, "contractNo is required"),
  titleAr: z.string().trim().min(1, "titleAr is required"),
  titleEn: z.string().trim().min(1, "titleEn is required"),
  startDate: dateString,
  endDate: dateString,
  paymentTermsDays: z.number().int().min(0).default(30),
  penaltyClause: z.string().optional(),
  sla: z.string().optional(),
  notes: z.string().optional(),
};

export const createContractSchema = z
  .object({
    ...contractBaseFields,
    sites: z
      .array(contractSiteInput)
      .min(1, "A contract needs at least one site"),
  })
  .superRefine((v, ctx) => {
    if (v.endDate.getTime() <= v.startDate.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endDate must be after startDate",
        path: ["endDate"],
      });
    }
  });

/**
 * Update schema: for DRAFT contracts every create field is optional.
 * Sites are managed via dedicated endpoints, so `sites` is omitted.
 * The service layer additionally locks non-DRAFT contracts to
 * notes/sla/penaltyClause/paymentTermsDays (→ 409 CONTRACT_LOCKED).
 */
export const updateContractSchema = z
  .object(contractBaseFields)
  .partial()
  .superRefine((v, ctx) => {
    if (
      v.startDate != null &&
      v.endDate != null &&
      v.endDate.getTime() <= v.startDate.getTime()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endDate must be after startDate",
        path: ["endDate"],
      });
    }
  });

export const statusTransitionSchema = z.object({
  to: z.nativeEnum(ContractStatus),
});

export const contractQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().trim().min(1).optional(),
  ),
  status: z.nativeEnum(ContractStatus).optional(),
  clientId: uuid.optional(),
});

export const addSiteSchema = contractSiteInput;
export const addRateSchema = rateInput;

export type CreateContractInput = z.infer<typeof createContractSchema>;
export type UpdateContractInput = z.infer<typeof updateContractSchema>;
export type StatusTransitionInput = z.infer<typeof statusTransitionSchema>;
export type ContractQueryInput = z.infer<typeof contractQuerySchema>;
export type AddSiteInput = z.infer<typeof addSiteSchema>;
export type AddRateInput = z.infer<typeof addRateSchema>;
