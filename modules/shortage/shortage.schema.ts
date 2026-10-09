import { z } from "zod";

/** Zod input schemas for the shortage engine module. */

export const uuidSchema = z.string().uuid();

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const shortageQuerySchema = z.object({
  date: dateSchema.optional(),
  siteId: uuidSchema.optional(),
  sectorId: uuidSchema.optional(),
});

export const replacementsQuerySchema = z.object({
  date: dateSchema.optional(),
  siteId: uuidSchema,
  shiftId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type ShortageQuery = z.infer<typeof shortageQuerySchema>;
export type ReplacementsQuery = z.infer<typeof replacementsQuerySchema>;
