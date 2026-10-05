import { ApiError } from "../../lib/api-response";
import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../lib/audit";
import type { Actor } from "../../lib/auth";
import type { CreateSectorInput } from "./lookup.schema";

/**
 * Sectors and positions for form dropdowns. Positions are seeded
 * with the three standard ranks on first read so the employee form
 * never opens with an empty list.
 */

export interface SectorDto {
  id: string;
  name: string;
  companyName: string;
}

export interface PositionDto {
  id: string;
  code: string;
  titleAr: string;
  titleEn: string;
}

const DEFAULT_POSITIONS = [
  { code: "GUARD", titleAr: "فرد أمن", titleEn: "Security Guard" },
  { code: "SUPERVISOR", titleAr: "مشرف", titleEn: "Supervisor" },
  { code: "SITE_MANAGER", titleAr: "مدير موقع", titleEn: "Site Manager" },
];

export async function listSectors(): Promise<SectorDto[]> {
  const rows = await prisma.sector.findMany({
    where: { deletedAt: null },
    include: { company: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    companyName: r.company.name,
  }));
}

export async function createSector(
  actor: Actor,
  input: CreateSectorInput,
  req?: Request,
): Promise<SectorDto> {
  const name = input.companyName?.trim() || "الشركة";
  const created = await prisma.$transaction(async (tx) => {
    const company = await tx.company.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    const duplicate = await tx.sector.findFirst({
      where: { companyId: company.id, name: input.name.trim(), deletedAt: null },
    });
    if (duplicate) {
      throw new ApiError(
        "DUPLICATE_SECTOR",
        "A sector with this name already exists",
        409,
      );
    }
    const row = await tx.sector.create({
      data: { name: input.name.trim(), companyId: company.id },
      include: { company: { select: { name: true } } },
    });
    await writeAudit(
      tx,
      actor,
      {
        action: "sector.create",
        module: "sites",
        recordId: row.id,
        newValue: { id: row.id, name: row.name },
      },
      req,
    );
    return row;
  });
  return {
    id: created.id,
    name: created.name,
    companyName: created.company.name,
  };
}

export async function listPositions(): Promise<PositionDto[]> {
  let rows = await prisma.position.findMany({ orderBy: { code: "asc" } });
  if (rows.length === 0) {
    rows = await prisma.$transaction(async (tx) => {
      for (const p of DEFAULT_POSITIONS) {
        await tx.position.upsert({
          where: { code: p.code },
          create: p,
          update: {},
        });
      }
      return tx.position.findMany({ orderBy: { code: "asc" } });
    });
  }
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    titleAr: r.titleAr,
    titleEn: r.titleEn,
  }));
}
