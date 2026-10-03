/**
 * Recruitment Zod schemas — input validation for the recruitment module.
 * Pure validation only; no Prisma, no I/O.
 */
import { z } from "zod";
import {
  CandidateStatus,
  CandidateSource,
  InterviewResult,
  MilitaryStatus,
} from "@prisma/client";

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

/** ISO datetime string → Date (for interview scheduling). */
export const dateTimeString = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s));

const uuid = z.string().uuid();

const egyptianNationalId = z
  .string()
  .trim()
  .regex(/^\d{14}$/, "nationalId must be a 14-digit number");

const egyptianPhone = z
  .string()
  .trim()
  .regex(/^01\d{9}$/, "phone must be an Egyptian mobile number (01xxxxxxxxx)");

const candidateBaseFields = {
  nameAr: z.string().trim().min(1, "nameAr is required"),
  nameEn: z.string().trim().min(1, "nameEn is required"),
  nationalId: egyptianNationalId,
  phone: egyptianPhone.nullish(),
  email: z.string().trim().email("Invalid email").nullish(),
  address: z.string().trim().max(500).nullish(),
  birthDate: dateString.nullish(),
  gender: z.enum(["M", "F"]).nullish(),
  militaryStatus: z.nativeEnum(MilitaryStatus).default(MilitaryStatus.PENDING),
  education: z.string().trim().max(200).nullish(),
  experienceYears: z.number().int().min(0).max(60).nullish(),
  desiredPositionId: uuid.nullish(),
  desiredSiteId: uuid.nullish(),
  source: z.nativeEnum(CandidateSource).default(CandidateSource.WALK_IN),
  cvUrl: z.string().trim().url("cvUrl must be a valid URL").nullish(),
  notes: z.string().trim().max(2000).nullish(),
};

export const createCandidateSchema = z.object(candidateBaseFields);

/**
 * Update schema: every create field optional; nationalId can change too
 * (service guards uniqueness). Status is managed via the dedicated
 * transition endpoint, so `status` is omitted.
 */
export const updateCandidateSchema = z.object(candidateBaseFields).partial();

export const candidateQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().trim().min(1).optional(),
  ),
  status: z.nativeEnum(CandidateStatus).optional(),
  siteId: uuid.optional(),
});

export const scheduleInterviewSchema = z
  .object({
    scheduledAt: dateTimeString,
    interviewerId: uuid.nullish(),
    location: z.string().trim().max(200).nullish(),
    notes: z.string().trim().max(2000).nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.scheduledAt.getTime() <= Date.now()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scheduledAt must be in the future",
        path: ["scheduledAt"],
      });
    }
  });

export const updateInterviewSchema = z
  .object({
    scheduledAt: dateTimeString.nullish(),
    interviewerId: uuid.nullish(),
    location: z.string().trim().max(200).nullish(),
    result: z.nativeEnum(InterviewResult).optional(),
    score: z.number().int().min(0).max(100).nullish(),
    notes: z.string().trim().max(2000).nullish(),
  })
  .superRefine((v, ctx) => {
    if (
      v.scheduledAt != null &&
      v.scheduledAt.getTime() <= Date.now() &&
      v.result === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scheduledAt must be in the future",
        path: ["scheduledAt"],
      });
    }
  });

export const statusTransitionSchema = z.object({
  to: z.nativeEnum(CandidateStatus),
});

export const hireCandidateSchema = z.object({
  siteId: uuid.nullish(),
  shiftId: uuid.nullish(),
  salary: z.number().positive("salary must be positive").nullish(),
  overrideCompliance: z.boolean().default(false),
});

export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;
export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;
export type CandidateQueryInput = z.infer<typeof candidateQuerySchema>;
export type ScheduleInterviewInput = z.infer<typeof scheduleInterviewSchema>;
export type UpdateInterviewInput = z.infer<typeof updateInterviewSchema>;
export type StatusTransitionInput = z.infer<typeof statusTransitionSchema>;
export type HireCandidateInput = z.infer<typeof hireCandidateSchema>;
