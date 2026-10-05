import { Prisma } from "@prisma/client";
import { ApiError } from "../../lib/api-response";
import { pageMeta } from "../../lib/pagination";
import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../lib/audit";
import { hashPassword } from "../../lib/password";
import type { Actor } from "../../lib/auth";
import type {
  AuditQuery,
  CreateUserInput,
  UpdateUserInput,
  UserQuery,
} from "./admin.schema";

/** User, role and audit-log administration. */

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  roleId: string;
  roleName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

function toUserDto(u: {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  roleId: string;
  role: { name: string };
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}): UserDto {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    phone: u.phone,
    roleId: u.roleId,
    roleName: u.role.name,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function listUsers(query: UserQuery): Promise<{
  data: UserDto[];
  page: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const where: Prisma.UserWhereInput = { deletedAt: null };
  if (query.search) {
    where.OR = [
      { email: { contains: query.search, mode: "insensitive" } },
      { fullName: { contains: query.search, mode: "insensitive" } },
    ];
  }
  if (query.roleId) where.roleId = query.roleId;
  if (query.isActive !== undefined) where.isActive = query.isActive;

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { role: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
  ]);
  return { data: rows.map(toUserDto), page: pageMeta(query.page, query.pageSize, total) };
}

export async function createUser(
  actor: Actor,
  input: CreateUserInput,
  req?: Request,
): Promise<UserDto> {
  const role = await prisma.role.findUnique({ where: { id: input.roleId } });
  if (!role) throw new ApiError("ROLE_NOT_FOUND", "Role not found", 404);

  const existing = await prisma.user.findFirst({
    where: { email: input.email.toLowerCase() },
  });
  if (existing) {
    throw new ApiError("DUPLICATE_EMAIL", "A user with this email already exists", 409);
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.user.create({
      data: {
        email: input.email.toLowerCase().trim(),
        passwordHash: await hashPassword(input.password),
        fullName: input.fullName.trim(),
        phone: input.phone?.trim() || null,
        roleId: role.id,
      },
      include: { role: { select: { name: true } } },
    });
    await writeAudit(
      tx,
      actor,
      {
        action: "user.create",
        module: "users",
        recordId: row.id,
        newValue: { email: row.email, fullName: row.fullName, role: role.name },
      },
      req,
    );
    return row;
  });
  return toUserDto(created);
}

export async function updateUser(
  actor: Actor,
  id: string,
  input: UpdateUserInput,
  req?: Request,
): Promise<UserDto> {
  const existing = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: { role: { select: { name: true } } },
  });
  if (!existing) throw new ApiError("NOT_FOUND", "User not found", 404);

  // Safety: nobody deactivates or demotes themselves.
  if (actor.userId === id) {
    if (input.isActive === false) {
      throw new ApiError("SELF_DEACTIVATE", "You cannot deactivate your own account", 422);
    }
    if (input.roleId && input.roleId !== existing.roleId) {
      throw new ApiError("SELF_DEMOTE", "You cannot change your own role", 422);
    }
  }

  if (input.roleId && input.roleId !== existing.roleId) {
    const role = await prisma.role.findUnique({ where: { id: input.roleId } });
    if (!role) throw new ApiError("ROLE_NOT_FOUND", "Role not found", 404);
  }

  const data: Prisma.UserUpdateInput = {};
  if (input.fullName !== undefined) data.fullName = input.fullName.trim();
  if (input.phone !== undefined) data.phone = input.phone?.trim() || null;
  if (input.roleId !== undefined) data.role = { connect: { id: input.roleId } };
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.password !== undefined) data.passwordHash = await hashPassword(input.password);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.user.update({
      where: { id },
      data,
      include: { role: { select: { name: true } } },
    });
    await writeAudit(
      tx,
      actor,
      {
        action: "user.update",
        module: "users",
        recordId: id,
        oldValue: {
          fullName: existing.fullName,
          role: existing.role.name,
          isActive: existing.isActive,
        },
        newValue: {
          fullName: row.fullName,
          role: row.role.name,
          isActive: row.isActive,
          passwordChanged: input.password !== undefined,
        },
      },
      req,
    );
    return row;
  });
  return toUserDto(updated);
}

export interface RoleDto {
  id: string;
  name: string;
  description: string | null;
  userCount: number;
  permissionIds: string[];
}

export async function listRoles(): Promise<RoleDto[]> {
  const roles = await prisma.role.findMany({
    include: {
      _count: { select: { users: true } },
      rolePermissions: { select: { permissionId: true } },
    },
    orderBy: { name: "asc" },
  });
  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    userCount: r._count.users,
    permissionIds: r.rolePermissions.map((rp) => rp.permissionId),
  }));
}

export interface PermissionDto {
  id: string;
  key: string;
  module: string;
  description: string | null;
}

export async function listPermissions(): Promise<PermissionDto[]> {
  const rows = await prisma.permission.findMany({
    orderBy: [{ module: "asc" }, { key: "asc" }],
  });
  return rows.map((p) => ({
    id: p.id,
    key: p.key,
    module: p.module,
    description: p.description,
  }));
}

export async function updateRolePermissions(
  actor: Actor,
  roleId: string,
  permissionIds: string[],
  req?: Request,
): Promise<RoleDto> {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new ApiError("NOT_FOUND", "Role not found", 404);

  // SUPER_ADMIN always keeps every permission.
  if (role.name === "SUPER_ADMIN") {
    throw new ApiError(
      "PROTECTED_ROLE",
      "The SUPER_ADMIN role cannot be modified",
      422,
    );
  }

  const permissions = await prisma.permission.findMany({
    where: { id: { in: permissionIds } },
    select: { id: true },
  });
  if (permissions.length !== permissionIds.length) {
    throw new ApiError("UNKNOWN_PERMISSION", "One or more permissions do not exist", 422);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    for (const pid of permissionIds) {
      await tx.rolePermission.create({ data: { roleId, permissionId: pid } });
    }
    await writeAudit(
      tx,
      actor,
      {
        action: "role.permissions.update",
        module: "users",
        recordId: roleId,
        newValue: { role: role.name, permissionCount: permissionIds.length },
      },
      req,
    );
    const row = await tx.role.findUniqueOrThrow({
      where: { id: roleId },
      include: {
        _count: { select: { users: true } },
        rolePermissions: { select: { permissionId: true } },
      },
    });
    return row;
  });

  return {
    id: updated.id,
    name: updated.name,
    description: updated.description,
    userCount: updated._count.users,
    permissionIds: updated.rolePermissions.map((rp) => rp.permissionId),
  };
}

export interface AuditLogDto {
  id: string;
  createdAt: string;
  userEmail: string | null;
  userName: string | null;
  action: string;
  module: string;
  recordId: string | null;
  ip: string | null;
}

export async function listAuditLogs(query: AuditQuery): Promise<{
  data: AuditLogDto[];
  page: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const where: Prisma.AuditLogWhereInput = {};
  if (query.module) where.module = query.module;
  if (query.action) where.action = { contains: query.action, mode: "insensitive" };
  if (query.userId) where.userId = query.userId;
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from + "T00:00:00Z");
    if (query.to) where.createdAt.lte = new Date(query.to + "T23:59:59Z");
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { email: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    data: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      userEmail: r.user?.email ?? null,
      userName: r.user?.fullName ?? null,
      action: r.action,
      module: r.module,
      recordId: r.recordId,
      ip: r.ip,
    })),
    page: pageMeta(query.page, query.pageSize, total),
  };
}

export async function getAuditLog(id: string): Promise<{
  log: AuditLogDto & { oldValue: unknown; newValue: unknown; userAgent: string | null };
}> {
  const r = await prisma.auditLog.findUnique({
    where: { id },
    include: { user: { select: { email: true, fullName: true } } },
  });
  if (!r) throw new ApiError("NOT_FOUND", "Audit log not found", 404);
  return {
    log: {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      userEmail: r.user?.email ?? null,
      userName: r.user?.fullName ?? null,
      action: r.action,
      module: r.module,
      recordId: r.recordId,
      ip: r.ip,
      oldValue: r.oldValue,
      newValue: r.newValue,
      userAgent: r.userAgent,
    },
  };
}
