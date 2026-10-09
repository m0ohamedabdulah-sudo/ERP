import { prisma } from "../../lib/prisma";
import type { Actor } from "../../lib/auth";
import { ApiError } from "../../lib/api-response";
import { computeShortage, severityOf } from "../../src/lib/shortage";
import { todayDateStr, utcDayStart } from "../operations/operations.service";
import type {
  ReplacementsQuery,
  ShortageQuery,
} from "./shortage.schema";

/**
 * Shortage calculation engine (master spec §4.G / Stage 4).
 *
 * For each date × site × shift:
 *   required  = effective ManpowerRequirement (shift-specific, else
 *               site-level), falling back to Shift.requiredStaff
 *   rostered  = distinct employees on a PUBLISHED/LOCKED roster that day
 *   present   = attendance rows whose code countsAsPresent
 *   absent    = attendance code A (unexcused)
 *   onLeave   = attendance codes AL / SL (approved leave — never
 *               confused with absence)
 *   shortage  = max(0, required − present)   (never double-counts:
 *               one employee contributes at most once per shift)
 *
 * Results are persisted to the Shortage table (upsert per
 * site+shift+date) so trends and "repeated shortage" reports read
 * real history instead of recomputing it.
 */

export type RequiredSource = "manpower" | "shift-default";

export interface ShiftShortageRow {
  siteId: string;
  siteName: string;
  shiftId: string;
  shiftName: string;
  required: number;
  requiredSource: RequiredSource;
  rostered: number;
  present: number;
  absent: number;
  onLeave: number;
  shortage: number;
  surplus: number;
  /** shortage as % of required, 2 decimals */
  pct: number;
  severity: "NORMAL" | "WARNING" | "CRITICAL";
}

export interface SiteShortage {
  siteId: string;
  siteName: string;
  shifts: ShiftShortageRow[];
  /** attendance rows with no shift attribution (honest bucket, never fabricated into a shift) */
  unassigned: { present: number; absent: number; onLeave: number };
  totals: {
    required: number;
    rostered: number;
    present: number;
    absent: number;
    onLeave: number;
    shortage: number;
    surplus: number;
    pct: number;
    severity: "NORMAL" | "WARNING" | "CRITICAL";
  };
}

export interface ShortageReport {
  date: string;
  sites: SiteShortage[];
  totals: SiteShortage["totals"] & { sites: number; redZones: number };
}

/** Pure row builder — unit-tested, no DB. */
export function buildShiftShortageRow(input: {
  siteId: string;
  siteName: string;
  shiftId: string;
  shiftName: string;
  required: number;
  requiredSource: RequiredSource;
  rostered: number;
  present: number;
  absent: number;
  onLeave: number;
}): ShiftShortageRow {
  const calc = computeShortage(input.required, input.present);
  return {
    ...input,
    shortage: calc.shortage,
    surplus: calc.surplus,
    pct: calc.pct,
    severity: severityOf(calc.pct),
  };
}

type Severity = "NORMAL" | "WARNING" | "CRITICAL";

function emptyTotals(): {
  required: number;
  rostered: number;
  present: number;
  absent: number;
  onLeave: number;
  shortage: number;
  surplus: number;
  pct: number;
  severity: Severity;
} {
  return {
    required: 0,
    rostered: 0,
    present: 0,
    absent: 0,
    onLeave: 0,
    shortage: 0,
    surplus: 0,
    pct: 0,
    severity: "NORMAL",
  };
}

export async function computeShortages(
  _actor: Actor,
  query: ShortageQuery,
): Promise<ShortageReport> {
  const dateStr = query.date ?? todayDateStr();
  const day = utcDayStart(dateStr);

  const sites = await prisma.site.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      ...(query.siteId ? { id: query.siteId } : {}),
      ...(query.sectorId ? { sectorId: query.sectorId } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (sites.length === 0) {
    return {
      date: dateStr,
      sites: [],
      totals: { ...emptyTotals(), sites: 0, redZones: 0 },
    };
  }
  const siteIds = sites.map((s) => s.id);
  const siteNameById = new Map(sites.map((s) => [s.id, s.name]));

  const shifts = await prisma.shift.findMany({
    where: { siteId: { in: siteIds }, isActive: true },
    select: { id: true, siteId: true, name: true, requiredStaff: true },
    orderBy: { name: "asc" },
  });

  // Effective manpower requirements: shift-specific wins, else site-level.
  const requirements = await prisma.manpowerRequirement.findMany({
    where: {
      siteId: { in: siteIds },
      effectiveFrom: { lte: day },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }],
    },
    select: { siteId: true, shiftId: true, requiredCount: true },
  });
  const reqByShift = new Map<string, number>();
  const reqBySite = new Map<string, number>();
  for (const r of requirements) {
    if (r.shiftId) reqByShift.set(`${r.siteId}:${r.shiftId}`, r.requiredCount);
    else reqBySite.set(r.siteId, (reqBySite.get(r.siteId) ?? 0) + r.requiredCount);
  }

  // Published/locked rosters covering the date → distinct rostered heads.
  const rosters = await prisma.roster.findMany({
    where: {
      status: { in: ["PUBLISHED", "LOCKED"] },
      deletedAt: null,
      startDate: { lte: day },
      endDate: { gte: day },
    },
    select: { id: true },
  });
  const rosteredByShift = new Map<string, Set<string>>();
  if (rosters.length > 0) {
    const assignments = await prisma.rosterAssignment.findMany({
      where: {
        rosterId: { in: rosters.map((r) => r.id) },
        siteId: { in: siteIds },
        date: day,
      },
      select: { employeeId: true, siteId: true, shiftId: true },
    });
    for (const a of assignments) {
      const key = `${a.siteId}:${a.shiftId}`;
      const set = rosteredByShift.get(key) ?? new Set<string>();
      set.add(a.employeeId); // one employee = one headcount, never double-counted
      rosteredByShift.set(key, set);
    }
  }

  // Attendance split by shift; shiftless rows go to the honest `unassigned` bucket.
  const records = await prisma.attendance.findMany({
    where: { siteId: { in: siteIds }, date: day },
    select: {
      siteId: true,
      shiftId: true,
      code: { select: { code: true, countsAsPresent: true } },
    },
  });
  interface Bucket {
    present: number;
    absent: number;
    onLeave: number;
  }
  const bucketByShift = new Map<string, Bucket>();
  const bucketBySite = new Map<string, Bucket>();
  const newBucket = (): Bucket => ({ present: 0, absent: 0, onLeave: 0 });
  for (const r of records) {
    const bucket = r.shiftId
      ? (bucketByShift.get(`${r.siteId}:${r.shiftId}`) ?? newBucket())
      : (bucketBySite.get(r.siteId) ?? newBucket());
    if (r.code.countsAsPresent) bucket.present += 1;
    else if (r.code.code === "ABSENT") bucket.absent += 1;
    else if (r.code.code === "ANNUAL_LEAVE" || r.code.code === "SICK_LEAVE")
      bucket.onLeave += 1;
    if (r.shiftId) bucketByShift.set(`${r.siteId}:${r.shiftId}`, bucket);
    else bucketBySite.set(r.siteId, bucket);
  }

  const siteReports: SiteShortage[] = [];
  const persistOps: Array<Promise<unknown>> = [];

  for (const site of sites) {
    const siteShifts = shifts.filter((s) => s.siteId === site.id);
    const shiftRows: ShiftShortageRow[] = [];

    for (const shift of siteShifts) {
      const key = `${site.id}:${shift.id}`;
      const manpower = reqByShift.get(key);
      const required = manpower ?? shift.requiredStaff;
      const requiredSource: RequiredSource =
        manpower !== undefined ? "manpower" : "shift-default";
      const bucket = bucketByShift.get(key) ?? newBucket();
      const row = buildShiftShortageRow({
        siteId: site.id,
        siteName: site.name,
        shiftId: shift.id,
        shiftName: shift.name,
        required,
        requiredSource,
        rostered: rosteredByShift.get(key)?.size ?? 0,
        present: bucket.present,
        absent: bucket.absent,
        onLeave: bucket.onLeave,
      });
      shiftRows.push(row);

      // Persist the engine's verdict for trend history.
      persistOps.push(
        prisma.shortage.upsert({
          where: {
            siteId_shiftId_date: { siteId: site.id, shiftId: shift.id, date: day },
          },
          update: {
            required: row.required,
            actual: row.present,
            shortage: row.shortage,
            surplus: row.surplus,
            percentage: row.pct,
            severity: row.severity,
          },
          create: {
            siteId: site.id,
            shiftId: shift.id,
            date: day,
            required: row.required,
            actual: row.present,
            shortage: row.shortage,
            surplus: row.surplus,
            percentage: row.pct,
            severity: row.severity,
          },
        }),
      );
    }

    const unassigned = bucketBySite.get(site.id) ?? newBucket();
    const totals = emptyTotals();
    for (const r of shiftRows) {
      totals.required += r.required;
      totals.rostered += r.rostered;
      totals.present += r.present;
      totals.absent += r.absent;
      totals.onLeave += r.onLeave;
    }
    // Site rollup includes shiftless attendance (it happened at this site).
    totals.present += unassigned.present;
    totals.absent += unassigned.absent;
    totals.onLeave += unassigned.onLeave;
    const rollup = computeShortage(totals.required, totals.present);
    totals.shortage = rollup.shortage;
    totals.surplus = rollup.surplus;
    totals.pct = rollup.pct;
    totals.severity = severityOf(rollup.pct);

    siteReports.push({
      siteId: site.id,
      siteName: siteNameById.get(site.id) ?? site.id,
      shifts: shiftRows,
      unassigned,
      totals,
    });
  }

  await Promise.all(persistOps);

  const totals = emptyTotals() as ShortageReport["totals"] & {
    sites: number;
    redZones: number;
  };
  let redZones = 0;
  for (const s of siteReports) {
    totals.required += s.totals.required;
    totals.rostered += s.totals.rostered;
    totals.present += s.totals.present;
    totals.absent += s.totals.absent;
    totals.onLeave += s.totals.onLeave;
    if (s.totals.severity === "CRITICAL") redZones += 1;
  }
  const rollup = computeShortage(totals.required, totals.present);
  totals.shortage = rollup.shortage;
  totals.surplus = rollup.surplus;
  totals.pct = rollup.pct;
  totals.severity = severityOf(rollup.pct);
  totals.sites = siteReports.length;
  totals.redZones = redZones;

  return { date: dateStr, sites: siteReports, totals };
}

/* ---------------- Replacement suggestions ---------------- */

export interface ReplacementCandidate {
  employeeId: string;
  cardNumber: string;
  fullNameAr: string;
  fullNameEn: string;
  /** employee's home site (null when unknown) */
  siteId: string | null;
  siteName: string | null;
  /** employee's usual shift, if assigned */
  shiftName: string | null;
  /** explainable eligibility reasons — never fabricated availability */
  reasons: string[];
}

/**
 * Eligible replacement candidates for a site+shift on a date.
 * Rules (explainable, no AI fabrication):
 *  - ACTIVE, not deleted, in the site's sector
 *  - no attendance record that date (not present/absent/on-leave anywhere)
 *  - no roster assignment that date (no simultaneous-assignment conflict)
 * Ranked: home-site staff first (faster mobilization), then by name.
 */
export async function getReplacementCandidates(
  _actor: Actor,
  query: ReplacementsQuery,
): Promise<{ date: string; siteId: string; shiftId: string | null; candidates: ReplacementCandidate[] }> {
  const dateStr = query.date ?? todayDateStr();
  const day = utcDayStart(dateStr);

  const site = await prisma.site.findUnique({
    where: { id: query.siteId },
    select: { id: true, name: true, sectorId: true, isActive: true, deletedAt: true },
  });
  if (!site || !site.isActive || site.deletedAt) {
    throw new ApiError("SITE_NOT_FOUND", "Site not found or inactive", 404);
  }
  if (query.shiftId) {
    const shift = await prisma.shift.findFirst({
      where: { id: query.shiftId, siteId: site.id, isActive: true },
      select: { id: true },
    });
    if (!shift) throw new ApiError("SHIFT_NOT_FOUND", "Shift not found at this site", 404);
  }

  const [attendanceBusy, rosterBusy] = await Promise.all([
    prisma.attendance.findMany({
      where: { date: day },
      select: { employeeId: true },
    }),
    prisma.rosterAssignment.findMany({
      where: { date: day },
      select: { employeeId: true },
    }),
  ]);
  const busy = new Set<string>();
  for (const r of attendanceBusy) busy.add(r.employeeId);
  for (const r of rosterBusy) busy.add(r.employeeId);

  const candidates = await prisma.employee.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      sectorId: site.sectorId,
      id: { notIn: [...busy] },
    },
    select: {
      id: true,
      cardNumber: true,
      fullNameAr: true,
      fullNameEn: true,
      siteId: true,
      site: { select: { name: true } },
      shift: { select: { name: true } },
    },
    take: query.limit * 3, // over-fetch, rank, then trim
  });

  const ranked = candidates
    .map((e) => {
      const reasons: string[] = ["same-sector", "no-roster-assignment-on-date", "no-attendance-on-date"];
      let score = 0;
      if (e.siteId === site.id) {
        reasons.unshift("home-site");
        score += 2;
      }
      return {
        employeeId: e.id,
        cardNumber: e.cardNumber,
        fullNameAr: e.fullNameAr,
        fullNameEn: e.fullNameEn,
        siteId: e.siteId,
        siteName: e.site?.name ?? null,
        shiftName: e.shift?.name ?? null,
        reasons,
        score,
      };
    })
    .sort((a, b) => b.score - a.score || a.fullNameEn.localeCompare(b.fullNameEn))
    .slice(0, query.limit)
    .map(({ score: _score, ...rest }) => rest);

  return { date: dateStr, siteId: site.id, shiftId: query.shiftId ?? null, candidates: ranked };
}
