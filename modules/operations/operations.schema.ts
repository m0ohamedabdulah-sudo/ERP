import { z } from "zod";

/** Zod input schemas for the Operations Command Center module. */

export const uuidSchema = z.string().uuid();

export const qrCheckinSchema = z.object({
  qrToken: z.string().min(8).max(128),
  cardNumber: z.string().trim().min(1).max(64),
});

export const qrCheckoutSchema = z.object({
  qrToken: z.string().min(8).max(128),
  cardNumber: z.string().trim().min(1).max(64),
});

export const manualCheckinSchema = z.object({
  employeeId: uuidSchema,
  siteId: uuidSchema,
  action: z.enum(["in", "out"]),
  note: z.string().trim().max(500).optional(),
});

export const qrRotateQuerySchema = z.object({
  rotate: z
    .enum(["0", "1", "true", "false"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

export type QrCheckinInput = z.infer<typeof qrCheckinSchema>;
export type QrCheckoutInput = z.infer<typeof qrCheckoutSchema>;
export type ManualCheckinInput = z.infer<typeof manualCheckinSchema>;
export type QrRotateQuery = z.infer<typeof qrRotateQuerySchema>;
