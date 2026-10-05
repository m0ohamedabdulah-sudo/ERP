import { Prisma } from "@prisma/client";
import { ApiError } from "../../lib/api-response";
import { pageMeta } from "../../lib/pagination";
import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../lib/audit";
import type { Actor } from "../../lib/auth";
import type {
  SiteQuery,
  CreateSiteInput,
  UpdateSiteInput,
} from "./site.schema";

/**
 * Site business logic + audit. Framework-agnostic: receives the
 * parsed input and the authenticated `Actor` — no auth checks here
 * (the controller enforces permissions).
 */

export interface SiteDto {
  id: string;
  name: string;
  location: string | null;
  contactName: string | null;
  contactPhone: string | null;
  requiredManpower: number;
  isActive: boolean;
  notes: string | null;
  sector: { id: string; name: string } | null;
  employeesCount: number;
  createdAt: string;
  updatedAt: string;
}

type SiteRow = Prisma.SiteGetPayload<{
  include: {
    sector: { select: { id: true; name: true } };
    _count: { select: { employees: true } };
  };
}>;

function toDto(row: SiteRow): SiteDto {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    requiredManpower: row.requiredManpower,
    isActive: row.isActive,
    notes: row.notes,
    sector: row.sector ? { id: row.sector.id, name: row.sector.name } : null,
    employeesCount: row._count.employees,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const siteInclude = {
  sector: { select: { id: true, name: true } },
  _count: {
    select: { employees: { where: { deletedAt: null } } },
  },
} as const;

export async function listSites(query: SiteQuery): Promise<{
  data: SiteDto[];
  page: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const { page, pageSize } = query;
  const where: Prisma.SiteWhereInput = { deletedAt: null };
  if (query.sectorId) where.sectorId = query.sectorId;
  if (query.isActive !== undefined) where.isActive = query.isActive;
  if (query.search) {
    const s = query.search;
    where.OR = [
      { name: { contains: s, mode: "insensitive" } },
      { location: { contains: s, mode: "insensitive" } },
      { contactName: { contains: s, mode: "insensitive" } },
    ];
  }
  const [rows, total] = await Promise.all([
    prisma.site.findMany({
      where,
      include: siteInclude,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.site.count({ where }),
  ]);
  return { data: rows.map(toDto), page: pageMeta(page, pageSize, total) };
}

export async function getSite(id: string): Promise<SiteDto> {
  const row = await prisma.site.findFirst({
    where: { id, deletedAt: null },
    include: siteInclude,
  });
  if (!row) throw new ApiError("NOT_FOUND", "Site not found", 404);
  return toDto(row);
}

export async function createSite(
  actor: Actor,
  input: CreateSiteInput,
  req?: Request,
): Promise<SiteDto> {
  const sector = await prisma.sector.findFirst({
    where: { id: input.sectorId, deletedAt: null },
  });
  if (!sector) throw new ApiError("SECTOR_NOT_FOUND", "Sector not found", 404);

  const duplicate = await prisma.site.findFirst({
    where: { sectorId: sector.id, name: input.name.trim(), deletedAt: null },
  });
  if (duplicate) {
    throw new ApiError(
      "DUPLICATE_SITE",
      "A site with this name already exists in the sector",
      409,
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.site.create({
      data: {
        name: input.name.trim(),
        sectorId: sector.id,
        location: input.location?.trim() || null,
        contactName: input.contactName?.trim() || null,
        contactPhone: input.contactPhone?.trim() || null,
        requiredManpower: input.requiredManpower,
        notes: input.notes?.trim() || null,
      },
      include: siteInclude,
    });
    await writeAudit(
      tx,
      actor,
      {
        action: "site.create",
        module: "sites",
        recordId: row.id,
        newValue: toDto(row),
      },
      req,
    );
    return row;
  });
  return toDto(created);
}

export async function updateSite(
  actor: Actor,
  id: string,
  input: UpdateSiteInput,
  req?: Request,
): Promise<SiteDto> {
  const existing = await prisma.site.findFirst({
    where: { id, deletedAt: null },
    include: siteInclude,
  });
  if (!existing) throw new ApiError("NOT_FOUND", "Site not found", 404);

  if (input.sectorId) {
    const sector = await prisma.sector.findFirst({
      where: { id: input.sectorId, deletedAt: null },
    });
    if (!sector)
      throw new ApiError("SECTOR_NOT_FOUND", "Sector not found", 404);
  }

  const data: Prisma.SiteUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.sectorId !== undefined)
    data.sector = { connect: { id: input.sectorId } };
  if (input.location !== undefined)
    data.location = input.location?.trim() || null;
  if (input.contactName !== undefined)
    data.contactName = input.contactName?.trim() || null;
  if (input.contactPhone !== undefined)
    data.contactPhone = input.contactPhone?.trim() || null;
  if (input.requiredManpower !== undefined)
    data.requiredManpower = input.requiredManpower;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.site.update({
      where: { id },
      data,
      include: siteInclude,
    });
    await writeAudit(
      tx,
      actor,
      {
        action: "site.update",
        module: "sites",
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

/** Soft delete — history (attendance, rosters) is preserved. */
export async function deleteSite(
  actor: Actor,
  id: string,
  req?: Request,
): Promise<void> {
  const existing = await prisma.site.findFirst({
    where: { id, deletedAt: null },
    include: siteInclude,
  });
  if (!existing) throw new ApiError("NOT_FOUND", "Site not found", 404);
  const activeEmployees = await prisma.employee.count({
    where: { siteId: id, deletedAt: null },
  });
  if (activeEmployees > 0) {
    throw new ApiError(
      "SITE_HAS_EMPLOYEES",
      "Site has active employees and cannot be deleted — transfer them first",
      409,
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.site.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await writeAudit(
      tx,
      actor,
      {
        action: "site.delete",
        module: "sites",
        recordId: id,
        oldValue: toDto(existing),
      },
      req,
    );
  });
}
