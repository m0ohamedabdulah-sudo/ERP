import { Prisma } from "@prisma/client";
import { ApiError } from "../../lib/api-response";
import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../lib/audit";
import type { Actor } from "../../lib/auth";
import type { CreateShiftInput, UpdateShiftInput } from "./shift.schema";

/** Shift business logic + audit (shifts belong to sites). */

export interface ShiftDto {
  id: string;
  siteId: string;
  name: string;
  type: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  requiredStaff: number;
  isActive: boolean;
}

function toDto(r: {
  id: string;
  siteId: string;
  name: string;
  type: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  requiredStaff: number;
  isActive: boolean;
}): ShiftDto {
  return { ...r };
}

async function requireSite(siteId: string) {
  const site = await prisma.site.findFirst({
    where: { id: siteId, deletedAt: null },
  });
  if (!site) throw new ApiError("SITE_NOT_FOUND", "Site not found", 404);
  return site;
}

export async function listShifts(siteId: string): Promise<ShiftDto[]> {
  await requireSite(siteId);
  const rows = await prisma.shift.findMany({
    where: { siteId },
    orderBy: { startTime: "asc" },
  });
  return rows.map(toDto);
}

export async function createShift(
  actor: Actor,
  siteId: string,
  input: CreateShiftInput,
  req?: Request,
): Promise<ShiftDto> {
  await requireSite(siteId);
  const duplicate = await prisma.shift.findFirst({
    where: { siteId, name: input.name.trim() },
  });
  if (duplicate) {
    throw new ApiError(
      "DUPLICATE_SHIFT",
      "A shift with this name already exists at the site",
      409,
    );
  }
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.shift.create({
      data: {
        siteId,
        name: input.name.trim(),
        type: input.type,
        startTime: input.startTime,
        endTime: input.endTime,
        breakMinutes: input.breakMinutes,
        requiredStaff: input.requiredStaff,
      },
    });
    await writeAudit(
      tx,
      actor,
      { action: "shift.create", module: "roster", recordId: row.id, newValue: toDto(row) },
      req,
    );
    return row;
  });
  return toDto(created);
}

export async function updateShift(
  actor: Actor,
  id: string,
  input: UpdateShiftInput,
  req?: Request,
): Promise<ShiftDto> {
  const existing = await prisma.shift.findUnique({ where: { id } });
  if (!existing) throw new ApiError("NOT_FOUND", "Shift not found", 404);

  const data: Prisma.ShiftUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.type !== undefined) data.type = input.type;
  if (input.startTime !== undefined) data.startTime = input.startTime;
  if (input.endTime !== undefined) data.endTime = input.endTime;
  if (input.breakMinutes !== undefined) data.breakMinutes = input.breakMinutes;
  if (input.requiredStaff !== undefined) data.requiredStaff = input.requiredStaff;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.shift.update({ where: { id }, data });
    await writeAudit(
      tx,
      actor,
      {
        action: "shift.update",
        module: "roster",
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

export async function deleteShift(
  actor: Actor,
  id: string,
  req?: Request,
): Promise<void> {
  const existing = await prisma.shift.findUnique({ where: { id } });
  if (!existing) throw new ApiError("NOT_FOUND", "Shift not found", 404);
  const used = await prisma.rosterAssignment.count({ where: { shiftId: id } });
  if (used > 0) {
    throw new ApiError(
      "SHIFT_IN_USE",
      "Shift is used in roster assignments and cannot be deleted",
      409,
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.shift.delete({ where: { id } });
    await writeAudit(
      tx,
      actor,
      { action: "shift.delete", module: "roster", recordId: id, oldValue: toDto(existing) },
      req,
    );
  });
}
