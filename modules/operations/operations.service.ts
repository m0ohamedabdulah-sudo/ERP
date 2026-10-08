import { randomBytes } from "node:crypto";
import { ApiError } from "../../lib/api-response";
import { writeAudit } from "../../lib/audit";
import type { Actor } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import type {
  ManualCheckinInput,
  QrCheckinInput,
  QrCheckoutInput,
} from "./operations.schema";

/**
 * Operations Command Center business logic:
 * guard site check-in/out (QR + manual), site QR token rotation,
 * and the live coverage board.
 */

/* ---------------- Pure helpers (unit-testable) ---------------- */

export const LATE_GRACE_MINUTES = 15;

export type CheckinStatus = "on-time" | "late" | "unscheduled";

/** "08:00" -> 480 */
export function toMinutes(hhmm: string): number {
  const parts = hhmm.split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  return h * 60 + m;
}

/** Wall-clock "HH:MM" in Africa/Cairo for a timestamp. */
export function cairoWallTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function computeCheckinStatus(
  checkedInAt: Date,
  shiftStart: string | null | undefined,
): CheckinStatus {
  if (!shiftStart) return "unscheduled";
  const at = toMinutes(cairoWallTime(checkedInAt));
  return at <= toMinutes(shiftStart) + LATE_GRACE_MINUTES ? "on-time" : "late";
}

/** Operational day "YYYY-MM-DD" (UTC, same convention as the rest of the app). */
export function todayDateStr(from: Date = new Date()): string {
  return from.toISOString().slice(0, 10);
}

export function utcDayStart(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

/** Token expiry: end of the operational day + 6h grace (covers night shifts). */
export function qrTokenExpiry(from: Date = new Date()): Date {
  return new Date(utcDayStart(todayDateStr(from)).getTime() + 30 * 60 * 60 * 1000);
}

export function newQrToken(): string {
  return randomBytes(24).toString("base64url");
}

/* ---------------- Internal lookups ---------------- */

async function requireValidToken(qrToken: string) {
  const row = await prisma.siteQrToken.findUnique({
    where: { token: qrToken },
    include: { site: true },
  });
  if (!row || !row.active || row.expiresAt <= new Date()) {
    throw new ApiError("INVALID_QR_TOKEN", "QR token is invalid or expired", 410);
  }
  if (!row.site.isActive || row.site.deletedAt) {
    throw new ApiError("SITE_INACTIVE", "Site is not active", 404);
  }
  return row;
}

async function requireActiveEmployee(cardNumber: string) {
  const employee = await prisma.employee.findFirst({
    where: { cardNumber, deletedAt: null },
    select: {
      id: true,
      cardNumber: true,
      fullNameAr: true,
      fullNameEn: true,
      status: true,
    },
  });
  if (!employee || employee.status !== "ACTIVE") {
    throw new ApiError("EMPLOYEE_NOT_FOUND", "Employee not found or not active", 404);
  }
  return employee;
}

async function findOpenCheckin(employeeId: string) {
  return prisma.siteCheckin.findFirst({
    where: { employeeId, checkedOutAt: null },
    orderBy: { checkedInAt: "desc" },
  });
}

async function findTodayAssignment(employeeId: string, todayStart: Date) {
  return prisma.rosterAssignment.findFirst({
    where: {
      employeeId,
      date: todayStart,
      roster: { status: "PUBLISHED" },
    },
    include: { shift: { select: { id: true, name: true, startTime: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/** Ensure today's attendance exists; set code P only when nothing was recorded yet. */
async function ensurePresentAttendance(
  employeeId: string,
  siteId: string,
  todayStart: Date,
  shiftId: string | null,
): Promise<boolean> {
  const existing = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId, date: todayStart } },
  });
  if (existing) return false; // never overwrite an existing code
  const pCode = await prisma.attendanceCode.findUnique({ where: { code: "P" } });
  if (!pCode) throw new ApiError("CONFIG_MISSING", "Attendance code P is not configured", 500);
  await prisma.attendance.create({
    data: {
      employeeId,
      siteId,
      date: todayStart,
      codeId: pCode.id,
      shiftId,
    },
  });
  return true;
}

/* ---------------- QR check-in / check-out (public, token-gated) ---------------- */

export interface CheckinResult {
  checkinId: string;
  siteId: string;
  siteName: string;
  employeeId: string;
  cardNumber: string;
  employeeName: string;
  checkedInAt: string;
  status: CheckinStatus;
  attendanceMarked: boolean;
  shiftName: string | null;
}

export async function qrCheckin(
  actor: Actor | null,
  input: QrCheckinInput,
  req?: Request,
): Promise<CheckinResult> {
  const tokenRow = await requireValidToken(input.qrToken);
  const employee = await requireActiveEmployee(input.cardNumber);

  const open = await findOpenCheckin(employee.id);
  if (open) {
    throw new ApiError("ALREADY_CHECKED_IN", "Employee already has an open check-in", 409);
  }

  const todayStart = utcDayStart(todayDateStr());
  const assignment = await findTodayAssignment(employee.id, todayStart);
  const shiftId = assignment?.shiftId ?? null;
  const now = new Date();
  const status = computeCheckinStatus(now, assignment?.shift.startTime);

  const checkin = await prisma.siteCheckin.create({
    data: {
      employeeId: employee.id,
      siteId: tokenRow.siteId,
      shiftId,
      checkedInAt: now,
      method: "QR",
    },
  });

  const attendanceMarked = await ensurePresentAttendance(
    employee.id,
    tokenRow.siteId,
    todayStart,
    shiftId,
  );

  await writeAudit(
    prisma,
    actor,
    {
      action: "operations.checkin",
      module: "operations",
      recordId: checkin.id,
      newValue: {
        employeeId: employee.id,
        cardNumber: employee.cardNumber,
        siteId: tokenRow.siteId,
        method: "QR",
        status,
      },
    },
    req,
  );

  return {
    checkinId: checkin.id,
    siteId: tokenRow.siteId,
    siteName: tokenRow.site.name,
    employeeId: employee.id,
    cardNumber: employee.cardNumber,
    employeeName: employee.fullNameAr,
    checkedInAt: checkin.checkedInAt.toISOString(),
    status,
    attendanceMarked,
    shiftName: assignment?.shift.name ?? null,
  };
}

export interface CheckoutResult {
  checkinId: string;
  employeeName: string;
  cardNumber: string;
  checkedInAt: string;
  checkedOutAt: string;
}

export async function qrCheckout(
  actor: Actor | null,
  input: QrCheckoutInput,
  req?: Request,
): Promise<CheckoutResult> {
  await requireValidToken(input.qrToken); // token is the gate
  const employee = await requireActiveEmployee(input.cardNumber);

  const open = await findOpenCheckin(employee.id);
  if (!open) {
    throw new ApiError("NO_OPEN_CHECKIN", "Employee has no open check-in", 404);
  }

  const closed = await prisma.siteCheckin.update({
    where: { id: open.id },
    data: { checkedOutAt: new Date() },
  });

  await writeAudit(
    prisma,
    actor,
    {
      action: "operations.checkout",
      module: "operations",
      recordId: closed.id,
      newValue: { employeeId: employee.id, cardNumber: employee.cardNumber },
    },
    req,
  );

  return {
    checkinId: closed.id,
    employeeName: employee.fullNameAr,
    cardNumber: employee.cardNumber,
    checkedInAt: closed.checkedInAt.toISOString(),
    checkedOutAt: closed.checkedOutAt!.toISOString(),
  };
}

/* ---------------- Manual check-in/out (supervisor) ---------------- */

export async function manualCheckin(
  actor: Actor,
  input: ManualCheckinInput,
  req?: Request,
): Promise<CheckinResult | CheckoutResult> {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, deletedAt: null },
    select: {
      id: true,
      cardNumber: true,
      fullNameAr: true,
      fullNameEn: true,
      status: true,
    },
  });
  if (!employee || employee.status !== "ACTIVE") {
    throw new ApiError("EMPLOYEE_NOT_FOUND", "Employee not found or not active", 404);
  }
  const site = await prisma.site.findFirst({
    where: { id: input.siteId, deletedAt: null },
    select: { id: true, name: true, isActive: true },
  });
  if (!site || !site.isActive) {
    throw new ApiError("SITE_NOT_FOUND", "Site not found or not active", 404);
  }

  const todayStart = utcDayStart(todayDateStr());

  if (input.action === "out") {
    const open = await findOpenCheckin(employee.id);
    if (!open) {
      throw new ApiError("NO_OPEN_CHECKIN", "Employee has no open check-in", 404);
    }
    const closed = await prisma.siteCheckin.update({
      where: { id: open.id },
      data: { checkedOutAt: new Date(), note: input.note ?? open.note },
    });
    await writeAudit(
      prisma,
      actor,
      {
        action: "operations.checkout.manual",
        module: "operations",
        recordId: closed.id,
        newValue: { employeeId: employee.id, note: input.note ?? null },
      },
      req,
    );
    return {
      checkinId: closed.id,
      employeeName: employee.fullNameAr,
      cardNumber: employee.cardNumber,
      checkedInAt: closed.checkedInAt.toISOString(),
      checkedOutAt: closed.checkedOutAt!.toISOString(),
    };
  }

  const open = await findOpenCheckin(employee.id);
  if (open) {
    throw new ApiError("ALREADY_CHECKED_IN", "Employee already has an open check-in", 409);
  }
  const assignment = await findTodayAssignment(employee.id, todayStart);
  const shiftId = assignment?.shiftId ?? null;
  const now = new Date();
  const status = computeCheckinStatus(now, assignment?.shift.startTime);

  const checkin = await prisma.siteCheckin.create({
    data: {
      employeeId: employee.id,
      siteId: site.id,
      shiftId,
      checkedInAt: now,
      method: "MANUAL",
      note: input.note ?? null,
    },
  });
  const attendanceMarked = await ensurePresentAttendance(
    employee.id,
    site.id,
    todayStart,
    shiftId,
  );

  await writeAudit(
    prisma,
    actor,
    {
      action: "operations.checkin.manual",
      module: "operations",
      recordId: checkin.id,
      newValue: {
        employeeId: employee.id,
        siteId: site.id,
        note: input.note ?? null,
        status,
      },
    },
    req,
  );

  return {
    checkinId: checkin.id,
    siteId: site.id,
    siteName: site.name,
    employeeId: employee.id,
    cardNumber: employee.cardNumber,
    employeeName: employee.fullNameAr,
    checkedInAt: checkin.checkedInAt.toISOString(),
    status,
    attendanceMarked,
    shiftName: assignment?.shift.name ?? null,
  };
}

/* ---------------- QR token management ---------------- */

export interface SiteQrDto {
  siteId: string;
  siteName: string;
  token: string;
  expiresAt: string;
  checkinUrl: string;
  rotated: boolean;
}

export function absoluteCheckinUrl(req: Request | undefined, token: string): string {
  const forwardedHost = req?.headers.get("x-forwarded-host");
  const host = forwardedHost ?? req?.headers.get("host") ?? "localhost:3000";
  const proto =
    req?.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}/ar/checkin/${token}`;
}

export async function getTokenInfo(qrToken: string) {
  const row = await requireValidToken(qrToken);
  return {
    valid: true as const,
    siteId: row.siteId,
    siteName: row.site.name,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function getOrRotateSiteQr(
  actor: Actor,
  siteId: string,
  forceRotate: boolean,
  req?: Request,
): Promise<SiteQrDto> {
  const site = await prisma.site.findFirst({
    where: { id: siteId, deletedAt: null },
    select: { id: true, name: true, isActive: true },
  });
  if (!site || !site.isActive) {
    throw new ApiError("SITE_NOT_FOUND", "Site not found or not active", 404);
  }

  const now = new Date();
  const dayStart = utcDayStart(todayDateStr(now));
  let token = await prisma.siteQrToken.findFirst({
    where: { siteId, active: true, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });

  let rotated = false;
  if (!token || token.createdAt < dayStart || forceRotate) {
    await prisma.siteQrToken.updateMany({
      where: { siteId, active: true },
      data: { active: false },
    });
    token = await prisma.siteQrToken.create({
      data: {
        siteId,
        token: newQrToken(),
        active: true,
        expiresAt: qrTokenExpiry(now),
      },
    });
    rotated = true;
    await writeAudit(
      prisma,
      actor,
      {
        action: "operations.qr.rotate",
        module: "operations",
        recordId: token.id,
        newValue: { siteId, expiresAt: token.expiresAt.toISOString() },
      },
      req,
    );
  }

  return {
    siteId: site.id,
    siteName: site.name,
    token: token.token,
    expiresAt: token.expiresAt.toISOString(),
    checkinUrl: absoluteCheckinUrl(req, token.token),
    rotated,
  };
}

/* ---------------- Live operations board ---------------- */

export interface LivePerson {
  employeeId: string;
  cardNumber: string;
  fullNameAr: string;
  fullNameEn: string;
  shiftName: string | null;
  checkedInAt?: string;
}

export interface LiveSiteBoard {
  siteId: string;
  siteName: string;
  required: number;
  requiredSource: "roster" | "manpower";
  present: number;
  redZone: boolean;
  missing: LivePerson[];
  late: LivePerson[];
  unscheduledPresent: LivePerson[];
}

export interface LiveBoard {
  date: string;
  sites: LiveSiteBoard[];
  alerts: { siteId: string; siteName: string; required: number; present: number }[];
  totals: { sites: number; required: number; present: number; missing: number; redZones: number };
}

export async function getLiveBoard(_actor: Actor): Promise<LiveBoard> {
  const dateStr = todayDateStr();
  const todayStart = utcDayStart(dateStr);

  const sites = await prisma.site.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (sites.length === 0) {
    return { date: dateStr, sites: [], alerts: [], totals: { sites: 0, required: 0, present: 0, missing: 0, redZones: 0 } };
  }
  const siteIds = sites.map((s) => s.id);

  const publishedRosters = await prisma.roster.findMany({
    where: {
      status: "PUBLISHED",
      deletedAt: null,
      startDate: { lte: todayStart },
      endDate: { gte: todayStart },
    },
    select: { id: true },
  });

  const assignments = await prisma.rosterAssignment.findMany({
    where: {
      rosterId: { in: publishedRosters.map((r) => r.id) },
      siteId: { in: siteIds },
      date: todayStart,
    },
    include: {
      employee: {
        select: { id: true, cardNumber: true, fullNameAr: true, fullNameEn: true },
      },
      shift: { select: { id: true, name: true, startTime: true } },
    },
  });

  const openCheckins = await prisma.siteCheckin.findMany({
    where: {
      siteId: { in: siteIds },
      checkedOutAt: null,
      checkedInAt: { gte: todayStart },
    },
    include: {
      employee: {
        select: { id: true, cardNumber: true, fullNameAr: true, fullNameEn: true },
      },
      shift: { select: { id: true, name: true, startTime: true } },
    },
  });

  // Manpower fallback requirements effective today.
  const manpower = await prisma.manpowerRequirement.findMany({
    where: {
      siteId: { in: siteIds },
      effectiveFrom: { lte: todayStart },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: todayStart } }],
    },
    select: { siteId: true, requiredCount: true },
  });
  const manpowerBySite = new Map<string, number>();
  for (const m of manpower) {
    manpowerBySite.set(m.siteId, (manpowerBySite.get(m.siteId) ?? 0) + m.requiredCount);
  }

  const assignmentsBySite = new Map<string, typeof assignments>();
  const assignmentByEmployee = new Map<string, (typeof assignments)[number]>();
  for (const a of assignments) {
    const list = assignmentsBySite.get(a.siteId) ?? [];
    list.push(a);
    assignmentsBySite.set(a.siteId, list);
    if (!assignmentByEmployee.has(a.employeeId)) assignmentByEmployee.set(a.employeeId, a);
  }
  const checkinsBySite = new Map<string, typeof openCheckins>();
  for (const c of openCheckins) {
    const list = checkinsBySite.get(c.siteId) ?? [];
    list.push(c);
    checkinsBySite.set(c.siteId, list);
  }

  const boards: LiveSiteBoard[] = [];
  const alerts: LiveBoard["alerts"] = [];

  for (const site of sites) {
    const siteAssignments = assignmentsBySite.get(site.id) ?? [];
    const distinctScheduled = new Map<string, (typeof assignments)[number]>();
    for (const a of siteAssignments) distinctScheduled.set(a.employeeId, a);

    let required: number;
    let requiredSource: "roster" | "manpower";
    if (distinctScheduled.size > 0) {
      required = distinctScheduled.size;
      requiredSource = "roster";
    } else {
      required = manpowerBySite.get(site.id) ?? 0;
      requiredSource = "manpower";
    }

    const siteCheckins = checkinsBySite.get(site.id) ?? [];
    const presentIds = new Set(siteCheckins.map((c) => c.employeeId));

    const missing: LivePerson[] = [];
    for (const a of distinctScheduled.values()) {
      if (!presentIds.has(a.employeeId)) {
        missing.push({
          employeeId: a.employee.id,
          cardNumber: a.employee.cardNumber,
          fullNameAr: a.employee.fullNameAr,
          fullNameEn: a.employee.fullNameEn,
          shiftName: a.shift.name,
        });
      }
    }

    const late: LivePerson[] = [];
    const unscheduledPresent: LivePerson[] = [];
    for (const c of siteCheckins) {
      const assignment = assignmentByEmployee.get(c.employeeId);
      const shiftStart = c.shift?.startTime ?? assignment?.shift.startTime ?? null;
      const person: LivePerson = {
        employeeId: c.employee.id,
        cardNumber: c.employee.cardNumber,
        fullNameAr: c.employee.fullNameAr,
        fullNameEn: c.employee.fullNameEn,
        shiftName: c.shift?.name ?? assignment?.shift.name ?? null,
        checkedInAt: c.checkedInAt.toISOString(),
      };
      const status = computeCheckinStatus(c.checkedInAt, shiftStart);
      if (status === "unscheduled") unscheduledPresent.push(person);
      else if (status === "late") late.push(person);
    }

    const present = siteCheckins.length;
    const redZone = required > 0 && present < required;

    boards.push({
      siteId: site.id,
      siteName: site.name,
      required,
      requiredSource,
      present,
      redZone,
      missing,
      late,
      unscheduledPresent,
    });

    if (redZone) {
      alerts.push({ siteId: site.id, siteName: site.name, required, present });
      // Persist one notification per site per day (idempotent).
      const existing = await prisma.notification.findFirst({
        where: {
          type: "OPERATIONS_SHORTAGE",
          relatedId: site.id,
          createdAt: { gte: todayStart },
        },
        select: { id: true },
      });
      if (!existing) {
        await prisma.notification.create({
          data: {
            type: "OPERATIONS_SHORTAGE",
            title: `Coverage shortage at ${site.name}: ${present}/${required} present`,
            titleAr: `عجز تغطية في ${site.name}: حاضر ${present} من ${required}`,
            body: `${required - present} guard(s) missing at ${site.name} on ${dateStr}.`,
            bodyAr: `يوجد عجز ${required - present} فرد في ${site.name} بتاريخ ${dateStr}.`,
            relatedModule: "operations",
            relatedId: site.id,
          },
        });
      }
    }
  }

  const totals = {
    sites: boards.length,
    required: boards.reduce((s, b) => s + b.required, 0),
    present: boards.reduce((s, b) => s + b.present, 0),
    missing: boards.reduce((s, b) => s + b.missing.length, 0),
    redZones: boards.filter((b) => b.redZone).length,
  };

  return { date: dateStr, sites: boards, alerts, totals };
}
