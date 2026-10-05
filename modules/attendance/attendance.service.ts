import { ApiError } from "../../lib/api-response";
import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../lib/audit";
import type { Actor } from "../../lib/auth";
import type {
  BoardQuery,
  MarkAttendanceInput,
} from "./attendance.schema";

/**
 * Attendance business logic + audit.
 */

export interface AttendanceCodeDto {
  id: string;
  code: string;
  labelAr: string;
  labelEn: string;
  countsAsPresent: boolean;
}

export interface BoardEmployeeDto {
  id: string;
  cardNumber: string;
  fullNameAr: string;
  attendance: {
    codeId: string;
    code: string;
    labelAr: string;
    notes: string | null;
  } | null;
}

export interface BoardDto {
  date: string;
  site: { id: string; name: string; requiredManpower: number };
  employees: BoardEmployeeDto[];
}

export async function listCodes(): Promise<AttendanceCodeDto[]> {
  const rows = await prisma.attendanceCode.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    labelAr: r.labelAr,
    labelEn: r.labelEn,
    countsAsPresent: r.countsAsPresent,
  }));
}

/** Everyone rostered at the site + their recorded code for the date. */
export async function getBoard(query: BoardQuery): Promise<BoardDto> {
  const site = await prisma.site.findFirst({
    where: { id: query.siteId, deletedAt: null },
  });
  if (!site) throw new ApiError("SITE_NOT_FOUND", "Site not found", 404);

  const date = new Date(query.date + "T00:00:00Z");
  const [employees, records] = await Promise.all([
    prisma.employee.findMany({
      where: { siteId: site.id, deletedAt: null, status: "ACTIVE" },
      select: { id: true, cardNumber: true, fullNameAr: true },
      orderBy: { fullNameAr: "asc" },
    }),
    prisma.attendance.findMany({
      where: { siteId: site.id, date },
      include: { code: true },
    }),
  ]);

  const byEmployee = new Map(records.map((r) => [r.employeeId, r]));
  return {
    date: query.date,
    site: {
      id: site.id,
      name: site.name,
      requiredManpower: site.requiredManpower,
    },
    employees: employees.map((e) => {
      const rec = byEmployee.get(e.id);
      return {
        id: e.id,
        cardNumber: e.cardNumber,
        fullNameAr: e.fullNameAr,
        attendance: rec
          ? {
              codeId: rec.codeId,
              code: rec.code.code,
              labelAr: rec.code.labelAr,
              notes: rec.notes,
            }
          : null,
      };
    }),
  };
}

/** Bulk upsert of one day's attendance for a site. */
export async function markAttendance(
  actor: Actor,
  input: MarkAttendanceInput,
  req?: Request,
): Promise<{ marked: number }> {
  const site = await prisma.site.findFirst({
    where: { id: input.siteId, deletedAt: null },
  });
  if (!site) throw new ApiError("SITE_NOT_FOUND", "Site not found", 404);

  const date = new Date(input.date + "T00:00:00Z");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (date.getTime() > today.getTime()) {
    throw new ApiError(
      "FUTURE_DATE",
      "Attendance cannot be recorded for a future date",
      422,
    );
  }

  const employeeIds = [...new Set(input.entries.map((e) => e.employeeId))];
  const codeIds = [...new Set(input.entries.map((e) => e.codeId))];

  const [employees, codes] = await Promise.all([
    prisma.employee.findMany({
      where: { id: { in: employeeIds }, deletedAt: null },
      select: { id: true, siteId: true },
    }),
    prisma.attendanceCode.findMany({
      where: { id: { in: codeIds }, isActive: true },
      select: { id: true },
    }),
  ]);

  const employeeSite = new Map(employees.map((e) => [e.id, e.siteId]));
  const validCodes = new Set(codes.map((c) => c.id));

  for (const entry of input.entries) {
    if (employeeSite.get(entry.employeeId) !== site.id) {
      throw new ApiError(
        "EMPLOYEE_NOT_AT_SITE",
        "One or more employees do not belong to this site",
        422,
      );
    }
    if (!validCodes.has(entry.codeId)) {
      throw new ApiError(
        "CODE_NOT_FOUND",
        "One or more attendance codes are invalid",
        404,
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const entry of input.entries) {
      await tx.attendance.upsert({
        where: {
          employeeId_date: { employeeId: entry.employeeId, date },
        },
        create: {
          employeeId: entry.employeeId,
          siteId: site.id,
          date,
          codeId: entry.codeId,
          notes: entry.notes?.trim() || null,
        },
        update: {
          codeId: entry.codeId,
          notes: entry.notes?.trim() || null,
        },
      });
    }
    await writeAudit(
      tx,
      actor,
      {
        action: "attendance.mark",
        module: "attendance",
        recordId: `${site.id}:${input.date}`,
        newValue: { date: input.date, siteId: site.id, marked: input.entries.length },
      },
      req,
    );
  });

  return { marked: input.entries.length };
}
