/**
 * Compliance Zod schemas — input validation for the compliance module.
 * Pure validation only; no Prisma, no I/O.
 */
import { z } from "zod";

/** Stored statuses only — MISSING is derived, never stored on a row. */
const storedDocumentStatus = z.enum(["VALID", "EXPIRING_SOON", "EXPIRED"]);

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

const documentTypeBaseFields = {
  code: z
    .string()
    .trim()
    .min(1, "code is required")
    .regex(
      /^[a-z0-9_]+$/,
      "code must be lowercase snake_case (letters, digits, underscores)",
    ),
  nameAr: z.string().trim().min(1, "nameAr is required"),
  nameEn: z.string().trim().min(1, "nameEn is required"),
  requiredForHire: z.boolean().default(false),
  validityMonths: z.number().int().positive().nullish(),
  isRecurring: z.boolean().default(true),
};

export const createDocumentTypeSchema = z.object(documentTypeBaseFields);

export const updateDocumentTypeSchema = z.object({
  nameAr: z.string().trim().min(1).optional(),
  nameEn: z.string().trim().min(1).optional(),
  requiredForHire: z.boolean().optional(),
  validityMonths: z.number().int().positive().nullish(),
  isRecurring: z.boolean().optional(),
});

export const documentTypeQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().trim().min(1).optional(),
  ),
  requiredForHire: z
    .preprocess((v) => {
      if (v === "true") return true;
      if (v === "false") return false;
      return v;
    }, z.boolean().optional())
    .optional(),
});

/**
 * Shared document upsert fields (candidate + employee).
 * expiresAt defaults server-side from issuedAt + the document type's
 * validityMonths when not provided (see compliance.service).
 */
const documentFields = {
  documentTypeId: uuid,
  documentNo: z.string().trim().min(1).max(100).nullish(),
  issuedAt: dateString.nullish(),
  expiresAt: dateString.nullish(),
  // Plain string URL/path reference — no storage wiring in Phase 2.
  fileUrl: z.string().trim().min(1).max(1000).nullish(),
  notes: z.string().trim().max(2000).optional(),
};

function checkExpiryOrder(
  v: { issuedAt?: Date | null; expiresAt?: Date | null },
  ctx: z.RefinementCtx,
): void {
  if (v.issuedAt != null && v.expiresAt != null && v.expiresAt < v.issuedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "expiresAt must be on or after issuedAt",
      path: ["expiresAt"],
    });
  }
}

export const upsertCandidateDocumentSchema = z
  .object(documentFields)
  .superRefine(checkExpiryOrder);

export const upsertEmployeeDocumentSchema = z
  .object(documentFields)
  .superRefine(checkExpiryOrder);

/** Partial updates for PATCH on candidate/employee documents by id. */
export const patchCandidateDocumentSchema = z
  .object({
    documentNo: z.string().trim().min(1).max(100).nullish(),
    issuedAt: dateString.nullish(),
    expiresAt: dateString.nullish(),
    fileUrl: z.string().trim().min(1).max(1000).nullish(),
    notes: z.string().trim().max(2000).optional(),
  })
  .superRefine(checkExpiryOrder);

export const patchEmployeeDocumentSchema = z
  .object({
    documentNo: z.string().trim().min(1).max(100).nullish(),
    issuedAt: dateString.nullish(),
    expiresAt: dateString.nullish(),
    fileUrl: z.string().trim().min(1).max(1000).nullish(),
    notes: z.string().trim().max(2000).optional(),
  })
  .superRefine(checkExpiryOrder);

export const documentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: storedDocumentStatus.optional(),
  documentTypeId: uuid.optional(),
  expiringWithinDays: z.coerce.number().int().min(1).max(365).optional(),
  search: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().trim().min(1).optional(),
  ),
});

export type CreateDocumentTypeInput = z.infer<typeof createDocumentTypeSchema>;
export type UpdateDocumentTypeInput = z.infer<typeof updateDocumentTypeSchema>;
export type DocumentTypeQueryInput = z.infer<typeof documentTypeQuerySchema>;
export type UpsertCandidateDocumentInput = z.infer<
  typeof upsertCandidateDocumentSchema
>;
export type UpsertEmployeeDocumentInput = z.infer<
  typeof upsertEmployeeDocumentSchema
>;
export type PatchCandidateDocumentInput = z.infer<
  typeof patchCandidateDocumentSchema
>;
export type PatchEmployeeDocumentInput = z.infer<
  typeof patchEmployeeDocumentSchema
>;
export type DocumentQueryInput = z.infer<typeof documentQuerySchema>;
