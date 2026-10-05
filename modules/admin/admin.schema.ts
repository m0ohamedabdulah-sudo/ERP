import { z } from "zod";

/** Input validation for user/role administration. */

const uuid = z.string().uuid();

export const userQuerySchema = z.object({
  search: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().trim().min(1).optional(),
  ),
  roleId: uuid.optional(),
  isActive: z
    .preprocess((v) => {
      if (v === "true") return true;
      if (v === "false") return false;
      return v;
    }, z.boolean().optional())
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type UserQuery = z.infer<typeof userQuerySchema>;

export const createUserSchema = z.object({
  email: z.string().trim().email("Invalid email").max(200),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  fullName: z.string().trim().min(1, "Full name is required").max(200),
  phone: z.string().trim().max(30).optional(),
  roleId: uuid,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().max(30).nullish(),
  roleId: uuid.optional(),
  isActive: z.boolean().optional(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200)
    .optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const updateRolePermissionsSchema = z.object({
  permissionIds: z.array(uuid).max(200),
});

export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const auditQuerySchema = z.object({
  module: z.string().trim().min(1).max(50).optional(),
  action: z.string().trim().min(1).max(100).optional(),
  userId: uuid.optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;
