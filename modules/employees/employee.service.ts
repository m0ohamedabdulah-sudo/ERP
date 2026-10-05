import { Prisma, EmployeeStatus } from "@prisma/client";
import { ApiError } from "../../lib/api-response";
import { pageMeta } from "../../lib/pagination";
import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../lib/audit";
import type { Actor } from "../../lib/auth";
import { nextSequence } from "../billing/billing.repository";
import type {
  EmployeeQuery,
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from "./employee.schema";

/**
 * Employee business logic + audit. Framework-agnostic: receives the
 * parsed input and the authenticated `Actor` — no auth checks here
 * (the controller enforces permissions).
 */

export interface EmployeeDto {
  id: string;
  cardNumber: string;
  fullNameAr: string;
  fullNameEn: string;
  nationalId: string;
  mobile: string | null;
  status: string;
  hiringDate: string;
  salary: number | null;
  site: { id: string; name: string } | null;
  sector: { id: string; name: string } | null;
  position: { id: string; titleAr: string; titleEn: string } | null;
  createdAt: string;
  updatedAt: string;
}

type EmployeeRow = Prisma.EmployeeGetPayload<{
  include: {
    site: { select: { id: true; name: true } };
    sector: { select: { id: true; name: true } };
    position: { select: { id: true; titleAr: true; titleEn: true } };
  };
}>;

function toDto(row: EmployeeRow): EmployeeDto {
  return {
    id: row.id,
    cardNumber: row.cardNumber,
    fullNameAr: row.fullNameAr,
    fullNameEn: row.fullNameEn,
    nationalId: row.nationalId,
    mobile: row.mobile,
    status: row.status,
    hiringDate: row.hiringDate.toISOString().slice(0, 10),
    salary: row.salary === null ? null : Number(row.salary),
    site: row.site ? { id: row.site.id, name: row.site.name } : null,
    sector: row.sector ? { id: row.sector.id, name: row.sector.name } : null,
    position: row.position
      ? {
          id: row.position.id,
          titleAr: row.position.titleAr,
          titleEn: row.position.titleEn,
        }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const employeeInclude = {
  site: { select: { id: true, name: true } },
  sector: { select: { id: true, name: true } },
  position: { select: { id: true, titleAr: true, titleEn: true } },
} as const;

export async function listEmployees(query: EmployeeQuery): Promise<{
  data: EmployeeDto[];
  page: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const { page, pageSize } = query;
  const where: Prisma.EmployeeWhereInput = { deletedAt: null };
  if (query.status) where.status = query.status;
  if (query.siteId) where.siteId = query.siteId;
  if (query.sectorId) where.sectorId = query.sectorId;
  if (query.search) {
    const s = query.search;
    where.OR = [
      { fullNameAr: { contains: s, mode: "insensitive" } },
      { fullNameEn: { contains: s, mode: "insensitive" } },
      { nationalId: { contains: s } },
      { cardNumber: { contains: s, mode: "insensitive" } },
    ];
  }
  const [rows, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: employeeInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.employee.count({ where }),
  ]);
  return { data: rows.map(toDto), page: pageMeta(page, pageSize, total) };
}

export async function getEmployee(id: string): Promise<EmployeeDto> {
  const row = await prisma.employee.findFirst({
    where: { id, deletedAt: null },
    include: employeeInclude,
  });
  if (!row) throw new ApiError("NOT_FOUND", "Employee not found", 404);
  return toDto(row);
}

export async function createEmployee(
  actor: Actor,
  input: CreateEmployeeInput,
  req?: Request,
): Promise<EmployeeDto> {
  const site = await prisma.site.findFirst({
    where: { id: input.siteId, deletedAt: null },
  });
  if (!site) throw new ApiError("SITE_NOT_FOUND", "Site not found", 404);

  if (input.positionId) {
    const position = await prisma.position.findUnique({
      where: { id: input.positionId },
    });
    if (!position)
      throw new ApiError("POSITION_NOT_FOUND", "Position not found", 404);
  }

  const duplicate = await prisma.employee.findUnique({
    where: { nationalId: input.nationalId },
  });
  if (duplicate) {
    throw new ApiError(
      "DUPLICATE_NATIONAL_ID",
      "An employee with this national ID already exists",
      409,
    );
  }

  const year = new Date().getFullYear();
  const created = await prisma.$transaction(async (tx) => {
    const seq = await nextSequence(tx, `employee-card:${year}`);
    const row = await tx.employee.create({
      data: {
        cardNumber: `EMP-${year}-${seq}`,
        fullNameAr: input.fullNameAr.trim(),
        fullNameEn: input.fullNameEn.trim(),
        nationalId: input.nationalId,
        mobile: input.mobile?.trim() || null,
        emergencyContact: input.emergencyContact?.trim() || null,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
        hiringDate: new Date(input.hiringDate),
        positionId: input.positionId ?? null,
        siteId: site.id,
        sectorId: site.sectorId,
        shiftId: input.shiftId ?? null,
        salary:
          input.salary !== undefined
            ? new Prisma.Decimal(input.salary)
            : null,
        contractType: input.contractType?.trim() || null,
        notes: input.notes?.trim() || null,
        status: EmployeeStatus.ACTIVE,
      },
      include: employeeInclude,
    });
    await writeAudit(
      tx,
      actor,
      {
        action: "employee.create",
        module: "employees",
        recordId: row.id,
        newValue: toDto(row),
      },
      req,
    );
    return row;
  });
  return toDto(created);
}

export async function updateEmployee(
  actor: Actor,
  id: string,
  input: UpdateEmployeeInput,
  req?: Request,
): Promise<EmployeeDto> {
  const existing = await prisma.employee.findFirst({
    where: { id, deletedAt: null },
    include: employeeInclude,
  });
  if (!existing) throw new ApiError("NOT_FOUND", "Employee not found", 404);

  let sectorId: string | undefined;
  if (input.siteId) {
    const site = await prisma.site.findFirst({
      where: { id: input.siteId, deletedAt: null },
    });
    if (!site) throw new ApiError("SITE_NOT_FOUND", "Site not found", 404);
    sectorId = site.sectorId;
  }

  if (input.nationalId && input.nationalId !== existing.nationalId) {
    const duplicate = await prisma.employee.findUnique({
      where: { nationalId: input.nationalId },
    });
    if (duplicate) {
      throw new ApiError(
        "DUPLICATE_NATIONAL_ID",
        "An employee with this national ID already exists",
        409,
      );
    }
  }

  const data: Prisma.EmployeeUpdateInput = {};
  if (input.fullNameAr !== undefined) data.fullNameAr = input.fullNameAr.trim();
  if (input.fullNameEn !== undefined) data.fullNameEn = input.fullNameEn.trim();
  if (input.nationalId !== undefined) data.nationalId = input.nationalId;
  if (input.mobile !== undefined) data.mobile = input.mobile?.trim() || null;
  if (input.emergencyContact !== undefined)
    data.emergencyContact = input.emergencyContact?.trim() || null;
  if (input.dateOfBirth !== undefined)
    data.dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
  if (input.hiringDate !== undefined)
    data.hiringDate = new Date(input.hiringDate);
  if (input.positionId !== undefined)
    data.position = input.positionId
      ? { connect: { id: input.positionId } }
      : { disconnect: true };
  if (input.siteId !== undefined) {
    data.site = { connect: { id: input.siteId } };
    if (sectorId) data.sector = { connect: { id: sectorId } };
  }
  if (input.shiftId !== undefined)
    data.shift = input.shiftId
      ? { connect: { id: input.shiftId } }
      : { disconnect: true };
  if (input.salary !== undefined)
    data.salary =
      input.salary === null ? null : new Prisma.Decimal(input.salary);
  if (input.contractType !== undefined)
    data.contractType = input.contractType?.trim() || null;
  if (input.status !== undefined) data.status = input.status;
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.employee.update({
      where: { id },
      data,
      include: employeeInclude,
    });
    await writeAudit(
      tx,
      actor,
      {
        action: "employee.update",
        module: "employees",
        recordId: id,
        oldValue: toDto(existing),
        newValue: toDto(row),
      },
      req,
    );
    return row;
  });
  return toDto(updated);
}

/** Soft delete — the record stays for payroll/audit history. */
export async function deleteEmployee(
  actor: Actor,
  id: string,
  req?: Request,
): Promise<void> {
  const existing = await prisma.employee.findFirst({
    where: { id, deletedAt: null },
    include: employeeInclude,
  });
  if (!existing) throw new ApiError("NOT_FOUND", "Employee not found", 404);
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id },
      data: { deletedAt: new Date(), status: EmployeeStatus.TERMINATED },
    });
    await writeAudit(
      tx,
      actor,
      {
        action: "employee.delete",
        module: "employees",
        recordId: id,
        oldValue: toDto(existing),
      },
      req,
    );
  });
}
