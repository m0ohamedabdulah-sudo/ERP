import { z } from "zod";

/**
 * Input validation for the sites module.
 */

export const createSiteSchema = z.object({
  name: z.string().min(1, "Site name is required"),
  sectorId: z.string().uuid("Invalid sector"),
  location: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  requiredManpower: z.number().int().nonnegative().default(0),
  notes: z.string().optional(),
});

export type CreateSiteInput = z.infer<typeof createSiteSchema>;

export const updateSiteSchema = z.object({
  name: z.string().min(1).optional(),
  sectorId: z.string().uuid("Invalid sector").optional(),
  location: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  requiredManpower: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;

export const siteQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().default(20),
  search: z.string().trim().optional(),
  sectorId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
});

export type SiteQuery = z.infer<typeof siteQuerySchema>;
