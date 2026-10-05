import { z } from "zod";

/** Small read-mostly lookups backing the admin forms. */

export const createSectorSchema = z.object({
  name: z.string().min(1, "Sector name is required"),
  companyName: z.string().min(1).optional(),
});

export type CreateSectorInput = z.infer<typeof createSectorSchema>;
