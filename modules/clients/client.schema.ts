import { z } from "zod";
import { ClientStatus } from "@prisma/client";

/**
 * Input validation for the clients module.
 *
 * Contacts are created inline with a client (up to 20). They are NOT
 * updatable through the client update endpoint — contact management
 * has its own endpoints (see updateClientSchema below).
 */

const clientContactInputSchema = z.object({
  name: z.string().min(1, "Contact name is required"),
  role: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid contact email").optional(),
  isPrimary: z.boolean().default(false),
});

export const createClientSchema = z.object({
  companyNameAr: z.string().min(1, "Arabic company name is required"),
  companyNameEn: z.string().min(1, "English company name is required"),
  taxId: z.string().optional(),
  commercialReg: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional(),
  status: z.nativeEnum(ClientStatus).default(ClientStatus.ACTIVE),
  notes: z.string().optional(),
  contacts: z
    .array(clientContactInputSchema)
    .max(20, "At most 20 contacts are allowed")
    .default([]),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;

/**
 * All fields optional. Contacts are intentionally NOT updatable here:
 * use the dedicated client-contact endpoints instead. Passing
 * `contacts` in an update body is a validation error.
 */
export const updateClientSchema = z.object({
  companyNameAr: z.string().min(1).optional(),
  companyNameEn: z.string().min(1).optional(),
  taxId: z.string().optional(),
  commercialReg: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  status: z.nativeEnum(ClientStatus).optional(),
  notes: z.string().optional(),
});

export type UpdateClientInput = z.infer<typeof updateClientSchema>;

export const clientQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().default(20),
  search: z.string().trim().optional(),
  status: z.nativeEnum(ClientStatus).optional(),
});

export type ClientQuery = z.infer<typeof clientQuerySchema>;
