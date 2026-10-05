import { z } from "zod";
import { RosterStatus } from "@prisma/client";

/** Input validation for rosters (weekly shift plans per site). */

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const createRosterSchema = z
  .object({
    siteId: z.string().uuid("Invalid site"),
    name: z.string().min(1, "Roster name is required"),
    startDate: dateString,
    endDate: dateString,
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });

export type CreateRosterInput = z.infer<typeof createRosterSchema>;

export const rosterQuerySchema = z.object({
  siteId: z.string().uuid().optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  status: z.nativeEnum(RosterStatus).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().default(20),
});

export type RosterQuery = z.infer<typeof rosterQuerySchema>;

const assignmentInput = z.object({
  employeeId: z.string().uuid("Invalid employee"),
  shiftId: z.string().uuid("Invalid shift"),
  date: dateString,
  notes: z.string().max(500).optional(),
});

export const setAssignmentsSchema = z.object({
  assignments: z
    .array(assignmentInput)
    .max(2000, "At most 2000 assignments per request"),
});

export type SetAssignmentsInput = z.infer<typeof setAssignmentsSchema>;
