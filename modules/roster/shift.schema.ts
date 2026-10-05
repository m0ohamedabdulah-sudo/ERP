import { z } from "zod";
import { ShiftType } from "@prisma/client";

/** Input validation for shifts (belong to a site). */

const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM");

export const createShiftSchema = z.object({
  name: z.string().min(1, "Shift name is required"),
  type: z.nativeEnum(ShiftType).default(ShiftType.CUSTOM),
  startTime: timeString,
  endTime: timeString,
  breakMinutes: z.number().int().nonnegative().default(0),
  requiredStaff: z.number().int().nonnegative().default(0),
});

export type CreateShiftInput = z.infer<typeof createShiftSchema>;

export const updateShiftSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.nativeEnum(ShiftType).optional(),
  startTime: timeString.optional(),
  endTime: timeString.optional(),
  breakMinutes: z.number().int().nonnegative().optional(),
  requiredStaff: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
