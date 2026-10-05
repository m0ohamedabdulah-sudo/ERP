import { z } from "zod";
import { EmployeeStatus } from "@prisma/client";

/**
 * Input validation for the employees module.
 *
 * sectorId is derived from the site (site.sectorId) in the service —
 * callers only pick the site, so sector can never disagree.
 */

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const createEmployeeSchema = z.object({
  fullNameAr: z.string().min(1, "Arabic name is required"),
  fullNameEn: z.string().min(1, "English name is required"),
  nationalId: z
    .string()
    .regex(/^\d{14}$/, "National ID must be exactly 14 digits"),
  mobile: z.string().optional(),
  emergencyContact: z.string().optional(),
  dateOfBirth: dateString.optional(),
  hiringDate: dateString,
  positionId: z.string().uuid("Invalid position").optional(),
  siteId: z.string().uuid("Invalid site"),
  shiftId: z.string().uuid("Invalid shift").optional(),
  salary: z.number().nonnegative().optional(),
  contractType: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  fullNameAr: z.string().min(1).optional(),
  fullNameEn: z.string().min(1).optional(),
  nationalId: z
    .string()
    .regex(/^\d{14}$/, "National ID must be exactly 14 digits")
    .optional(),
  mobile: z.string().optional(),
  emergencyContact: z.string().optional(),
  dateOfBirth: dateString.optional(),
  hiringDate: dateString.optional(),
  positionId: z.string().uuid("Invalid position").nullable().optional(),
  siteId: z.string().uuid("Invalid site").optional(),
  shiftId: z.string().uuid("Invalid shift").nullable().optional(),
  salary: z.number().nonnegative().nullable().optional(),
  contractType: z.string().nullable().optional(),
  status: z.nativeEnum(EmployeeStatus).optional(),
  notes: z.string().nullable().optional(),
});

export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const employeeQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().default(20),
  search: z.string().trim().optional(),
  siteId: z.string().uuid().optional(),
  sectorId: z.string().uuid().optional(),
  status: z.nativeEnum(EmployeeStatus).optional(),
});

export type EmployeeQuery = z.infer<typeof employeeQuerySchema>;
