import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(256),
});

export const setupSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(256),
  fullName: z.string().min(2).max(120),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SetupInput = z.infer<typeof setupSchema>;
