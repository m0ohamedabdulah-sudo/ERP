import { Prisma } from "@prisma/client";
import { ApiError } from "../../lib/api-response";
import { pageMeta } from "../../lib/pagination";
import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../lib/audit";
import type { Actor } from "../../lib/auth";
import type {
  CreateRosterInput,
  RosterQuery,
  SetAssignmentsInput,
} from "./roster.schema";

/** Roster business logic + audit. */

export interface AssignmentDto {
  id: string;
  employeeId: string;
  employeeName: string;
  cardNumber: string;
  shiftId: string;
  shiftName: string;
  date: string;
}

export interface RosterDto {
  id: string;
  siteId: string;
  siteName: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  assignments: AssignmentDto[];
}

function toDto(
  r: Prisma.RosterGetPayload<{
    include: {
      site: { select: { name: true } };
      assignments: {
        include: {
          employee: { select: { fullNameAr: true; cardNumber: true } };
          shift: { select: { name: true } };
        };
      };
    };
  }>,
): RosterDto {
  return {
    id: r.id,
    siteId: r.siteId,
    siteName: r.site.name,
    name: r.name,
    startDate: r.startDate.toISOString().slice(0, 10),
    endDate: r.endDate.toISOString().slice(0, 10),
    status: r.status,
    assignments: r.assignments.map((a) => ({
      id: a.id,
      employeeId: a.employeeId,
      employeeName: a.employee.fullNameAr,
      cardNumber: a.employee.cardNumber,
      shiftId: a.shiftId,
      shiftName: a.shift.name,
      date: a.date.toISOString().slice(0, 10),
    })),
  };
}

const rosterInclude = {
  site: { select: { name: true } },
  assignments: {
    include: {
      employee: { select: { fullNameAr: true, cardNumber: true } },
      shift: { select: { name: true } },
    },
  },
} as const;

export async function listRosters(query: RosterQuery): Promise<{
  data: RosterDto[];
  page: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const { page, pageSize } = query;
  const where: Prisma.RosterWhereInput = { deletedAt: null };
  if (query.siteId) where.siteId = query.siteId;
  if (query.status) where.status = query.status;
  if (query.from) where.endDate = { gte: new Date(query.from) };
  if (query.to) where.startDate = { lte: new Date(query.to) };
  const [rows, total] = await Promise.all([
    prisma.roster.findMany({
      where,
      include: rosterInclude,
      orderBy: { startDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.roster.count({ where }),
  ]);
  return { data: rows.map(toDto), page: pageMeta(page, pageSize, total) };
}

export async function getRoster(id: string): Promise<RosterDto> {
  const row = await prisma.roster.findFirst({
    where: { id, deletedAt: null },
    include: rosterInclude,
  });
  if (!row) throw new ApiError("NOT_FOUND", "Roster not found", 404);
  return toDto(row);
}

export async function createRoster(
  actor: Actor,
  input: CreateRosterInput,
  req?: Request,
): Promise<RosterDto> {
  if (!actor.userId) {
    throw new ApiError("UNAUTHENTICATED", "Authentication required", 401);
  }
  const site = await prisma.site.findFirst({
    where: { id: input.siteId, deletedAt: null },
  });
  if (!site) throw new ApiError("SITE_NOT_FOUND", "Site not found", 404);

  const overlap = await prisma.roster.findFirst({
    where: {
      siteId: site.id,
      deletedAt: null,
      startDate: { lte: new Date(input.endDate) },
      endDate: { gte: new Date(input.startDate) },
    },
  });
  if (overlap) {
    throw new ApiError(
      "ROSTER_OVERLAP",
      "A roster already covers this period at the site",
      409,
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.roster.create({
      data: {
        siteId: site.id,
        name: input.name.trim(),
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        createdById: actor.userId as string,
      },
      include: rosterInclude,
    });
    await writeAudit(
      tx,
      actor,
      { action: "roster.create", module: "roster", recordId: row.id, newValue: toDto(row) },
      req,
    );
    return row;
  });
  return toDto(created);
}

/**
 * Replace the roster's assignments with the given set (board save).
 * Only DRAFT rosters can be edited.
 */
export async function setAssignments(
  actor: Actor,
  rosterId: string,
  input: SetAssignmentsInput,
  req?: Request,
): Promise<{ saved: number }> {
  const roster = await prisma.roster.findFirst({
    where: { id: rosterId, deletedAt: null },
  });
  if (!roster) throw new ApiError("NOT_FOUND", "Roster not found", 404);
  if (roster.status !== "DRAFT") {
    throw new ApiError(
      "ROSTER_LOCKED",
      "Only draft rosters can be edited",
      409,
    );
  }

  const shiftIds = [...new Set(input.assignments.map((a) => a.shiftId))];
  const employeeIds = [...new Set(input.assignments.map((a) => a.employeeId))];

  const [shifts, employees] = await Promise.all([
    prisma.shift.findMany({
      where: { id: { in: shiftIds }, siteId: roster.siteId },
      select: { id: true },
    }),
    prisma.employee.findMany({
      where: { id: { in: employeeIds }, siteId: roster.siteId, deletedAt: null },
      select: { id: true },
    }),
  ]);
  const validShifts = new Set(shifts.map((s) => s.id));
  const validEmployees = new Set(employees.map((e) => e.id));

  const start = roster.startDate.toISOString().slice(0, 10);
  const end = roster.endDate.toISOString().slice(0, 10);
  for (const a of input.assignments) {
    if (!validShifts.has(a.shiftId) || !validEmployees.has(a.employeeId)) {
      throw new ApiError(
        "INVALID_ASSIGNMENT",
        "One or more assignments reference an unknown shift or employee",
        422,
      );
    }
    if (a.date < start || a.date > end) {
      throw new ApiError(
        "DATE_OUT_OF_RANGE",
        "One or more assignments fall outside the roster period",
        422,
      );
    }
  }

  // De-duplicate (employee, date, shift) — the unique constraint.
  const seen = new Set<string>();
  const deduped = input.assignments.filter((a) => {
    const k = `${a.employeeId}|${a.date}|${a.shiftId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  await prisma.$transaction(async (tx) => {
    await tx.rosterAssignment.deleteMany({ where: { rosterId } });
    for (const a of deduped) {
      await tx.rosterAssignment.create({
        data: {
          rosterId,
          employeeId: a.employeeId,
          shiftId: a.shiftId,
          siteId: roster.siteId,
          date: new Date(a.date),
          notes: a.notes?.trim() || null,
        },
      });
    }
    await writeAudit(
      tx,
      actor,
      {
        action: "roster.assignments.set",
        module: "roster",
        recordId: rosterId,
        newValue: { saved: deduped.length },
      },
      req,
    );
  });

  return { saved: deduped.length };
}

export async function publishRoster(
  actor: Actor,
  rosterId: string,
  req?: Request,
): Promise<RosterDto> {
  const roster = await prisma.roster.findFirst({
    where: { id: rosterId, deletedAt: null },
    include: rosterInclude,
  });
  if (!roster) throw new ApiError("NOT_FOUND", "Roster not found", 404);
  if (roster.status !== "DRAFT") {
    throw new ApiError("ROSTER_LOCKED", "Only draft rosters can be published", 409);
  }
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.roster.update({
      where: { id: rosterId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
      include: rosterInclude,
    });
    await writeAudit(
      tx,
      actor,
      {
        action: "roster.publish",
        module: "roster",
        recordId: rosterId,
        oldValue: { status: "DRAFT" },
        newValue: { status: "PUBLISHED" },
      },
      req,
    );
    return row;
  });
  return toDto(updated);
}

export async function deleteRoster(
  actor: Actor,
  rosterId: string,
  req?: Request,
): Promise<void> {
  const roster = await prisma.roster.findFirst({
    where: { id: rosterId, deletedAt: null },
  });
  if (!roster) throw new ApiError("NOT_FOUND", "Roster not found", 404);
  if (roster.status !== "DRAFT") {
    throw new ApiError("ROSTER_LOCKED", "Only draft rosters can be deleted", 409);
  }
  await prisma.$transaction(async (tx) => {
    await tx.roster.update({
      where: { id: rosterId },
      data: { deletedAt: new Date() },
    });
    await writeAudit(
      tx,
      actor,
      { action: "roster.delete", module: "roster", recordId: rosterId },
      req,
    );
  });
}
