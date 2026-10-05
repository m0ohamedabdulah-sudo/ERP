import { z } from "zod";

/**
 * Input validation for the attendance module.
 *
 * Marking is a bulk upsert: one row per (employee, date). The board
 * endpoint returns every active employee of a site for a date together
 * with their recorded code (if any).
 */

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const boardQuerySchema = z.object({
  date: dateString,
  siteId: z.string().uuid("Invalid site"),
});

export type BoardQuery = z.infer<typeof boardQuerySchema>;

const markEntrySchema = z.object({
  employeeId: z.string().uuid("Invalid employee"),
  codeId: z.string().uuid("Invalid attendance code"),
  notes: z.string().optional(),
});

export const markAttendanceSchema = z.object({
  date: dateString,
  siteId: z.string().uuid("Invalid site"),
  entries: z
    .array(markEntrySchema)
    .min(1, "At least one entry is required")
    .max(500, "At most 500 entries per request"),
});

export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
