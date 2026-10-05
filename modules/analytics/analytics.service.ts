import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import type { FinanceQuery, OperationsQuery } from "./analytics.schema";

/** Read-only analytics aggregations for the dashboards. */

export interface DailyAttendance {
  date: string;
  present: number;
  absent: number;
}

export interface SiteCoverage {
  siteId: string;
  siteName: string;
  required: number;
  active: number;
  presentToday: number;
  shortage: number;
}

export interface OperationsAnalytics {
  daily: DailyAttendance[];
  sites: SiteCoverage[];
  totals: { present: number; absent: number; records: number };
}

export async function getOperations(
  q: OperationsQuery,
): Promise<OperationsAnalytics> {
  const from = new Date(q.from + "T00:00:00Z");
  const to = new Date(q.to + "T00:00:00Z");

  const where: Prisma.AttendanceWhereInput = {
    date: { gte: from, lte: to },
  };
  if (q.siteId) where.siteId = q.siteId;

  const rows = await prisma.attendance.findMany({
    where,
    select: { date: true, code: { select: { countsAsPresent: true } } },
  });

  const byDay = new Map<string, { present: number; absent: number }>();
  let present = 0;
  let absent = 0;
  for (const r of rows) {
    const d = r.date.toISOString().slice(0, 10);
    const bucket = byDay.get(d) ?? { present: 0, absent: 0 };
    if (r.code.countsAsPresent) {
      bucket.present += 1;
      present += 1;
    } else {
      bucket.absent += 1;
      absent += 1;
    }
    byDay.set(d, bucket);
  }

  const daily: DailyAttendance[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    const d = cursor.toISOString().slice(0, 10);
    const b = byDay.get(d) ?? { present: 0, absent: 0 };
    daily.push({ date: d, present: b.present, absent: b.absent });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Per-site coverage as of today.
  const siteWhere: Prisma.SiteWhereInput = { deletedAt: null, isActive: true };
  if (q.siteId) siteWhere.id = q.siteId;
  const sites = await prisma.site.findMany({
    where: siteWhere,
    select: { id: true, name: true, requiredManpower: true },
    orderBy: { name: "asc" },
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayStart = new Date(todayStr + "T00:00:00Z");
  const [activeCounts, presentToday] = await Promise.all([
    prisma.employee.groupBy({
      by: ["siteId"],
      where: { deletedAt: null, status: "ACTIVE", siteId: { in: sites.map((s) => s.id) } },
      _count: { id: true },
    }),
    prisma.attendance.groupBy({
      by: ["siteId"],
      where: {
        date: todayStart,
        siteId: { in: sites.map((s) => s.id) },
        code: { countsAsPresent: true },
      },
      _count: { id: true },
    }),
  ]);
  const activeBySite = new Map(activeCounts.map((a) => [a.siteId, a._count.id]));
  const presentBySite = new Map(presentToday.map((a) => [a.siteId, a._count.id]));

  const siteRows: SiteCoverage[] = sites.map((s) => {
    const active = activeBySite.get(s.id) ?? 0;
    const presentNow = presentBySite.get(s.id) ?? 0;
    return {
      siteId: s.id,
      siteName: s.name,
      required: s.requiredManpower,
      active,
      presentToday: presentNow,
      shortage: Math.max(0, s.requiredManpower - presentNow),
    };
  });

  return {
    daily,
    sites: siteRows,
    totals: { present, absent, records: rows.length },
  };
}

export interface FinanceMonth {
  month: string; // YYYY-MM
  payroll: number;
  invoiced: number;
  collected: number;
}

export interface FinanceAnalytics {
  monthly: FinanceMonth[];
  outstanding: number;
  totals: { payroll: number; invoiced: number; collected: number };
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export async function getFinance(q: FinanceQuery): Promise<FinanceAnalytics> {
  const now = new Date();
  const months: { year: number; month: number; key: string }[] = [];
  for (let i = q.months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    months.push({ year, month, key: monthKey(year, month) });
  }
  const oldest = months[0] ?? { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, key: monthKey(now.getUTCFullYear(), now.getUTCMonth() + 1) };

  const [payrollRows, invoiceRows, paymentRows, openInvoices] = await Promise.all([
    prisma.payrollRecord.groupBy({
      by: ["periodYear", "periodMonth"],
      where: {
        OR: months.map((m) => ({ periodYear: m.year, periodMonth: m.month })),
      },
      _sum: { netPay: true },
    }),
    prisma.invoice.groupBy({
      by: ["periodStart"],
      where: {
        status: { in: ["ISSUED", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"] },
        periodStart: { gte: new Date(`${oldest.key}-01T00:00:00Z`) },
      },
      _sum: { total: true },
    }),
    prisma.payment.groupBy({
      by: ["paidAt"],
      where: { paidAt: { gte: new Date(`${oldest.key}-01T00:00:00Z`) } },
      _sum: { amount: true },
    }),
    prisma.invoice.findMany({
      where: { status: { in: ["ISSUED", "SENT", "PARTIALLY_PAID", "OVERDUE"] } },
      select: { total: true, payments: { select: { amount: true } } },
    }),
  ]);

  const payrollByMonth = new Map(
    payrollRows.map((r) => [monthKey(r.periodYear, r.periodMonth), Number(r._sum.netPay ?? 0)]),
  );
  const invoicedByMonth = new Map<string, number>();
  for (const r of invoiceRows) {
    const k = r.periodStart.toISOString().slice(0, 7);
    invoicedByMonth.set(k, (invoicedByMonth.get(k) ?? 0) + Number(r._sum.total ?? 0));
  }
  const collectedByMonth = new Map<string, number>();
  for (const r of paymentRows) {
    const k = r.paidAt.toISOString().slice(0, 7);
    collectedByMonth.set(k, (collectedByMonth.get(k) ?? 0) + Number(r._sum.amount ?? 0));
  }

  const monthly: FinanceMonth[] = months.map((m) => ({
    month: m.key,
    payroll: Math.round((payrollByMonth.get(m.key) ?? 0) * 100) / 100,
    invoiced: Math.round((invoicedByMonth.get(m.key) ?? 0) * 100) / 100,
    collected: Math.round((collectedByMonth.get(m.key) ?? 0) * 100) / 100,
  }));

  let outstanding = 0;
  for (const inv of openInvoices) {
    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    outstanding += Math.max(0, Number(inv.total) - paid);
  }

  const totals = monthly.reduce(
    (s, m) => ({
      payroll: s.payroll + m.payroll,
      invoiced: s.invoiced + m.invoiced,
      collected: s.collected + m.collected,
    }),
    { payroll: 0, invoiced: 0, collected: 0 },
  );

  return {
    monthly,
    outstanding: Math.round(outstanding * 100) / 100,
    totals: {
      payroll: Math.round(totals.payroll * 100) / 100,
      invoiced: Math.round(totals.invoiced * 100) / 100,
      collected: Math.round(totals.collected * 100) / 100,
    },
  };
}

export interface HrAnalytics {
  byStatus: { status: string; count: number }[];
  bySite: { siteName: string; count: number }[];
  expiringDocuments: {
    employeeName: string;
    cardNumber: string;
    documentTypeAr: string;
    documentTypeEn: string;
    expiresAt: string;
  }[];
  expiredCount: number;
  totalActive: number;
}

export async function getHr(): Promise<HrAnalytics> {
  const [byStatus, bySite, expiring, expiredCount, totalActive] = await Promise.all([
    prisma.employee.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { id: true },
    }),
    prisma.employee.groupBy({
      by: ["siteId"],
      where: { deletedAt: null, status: "ACTIVE" },
      _count: { id: true },
    }),
    prisma.employeeDocument.findMany({
      where: {
        expiresAt: {
          gte: new Date(),
          lte: new Date(Date.now() + 30 * 86400000),
        },
      },
      select: {
        expiresAt: true,
        employee: { select: { fullNameAr: true, cardNumber: true } },
        documentType: { select: { nameAr: true, nameEn: true } },
      },
      orderBy: { expiresAt: "asc" },
      take: 50,
    }),
    prisma.employeeDocument.count({
      where: { expiresAt: { lt: new Date() } },
    }),
    prisma.employee.count({ where: { deletedAt: null, status: "ACTIVE" } }),
  ]);

  const siteIds = [...new Set(bySite.map((r) => r.siteId).filter(Boolean))] as string[];
  const sites = await prisma.site.findMany({
    where: { id: { in: siteIds } },
    select: { id: true, name: true },
  });
  const siteName = new Map(sites.map((s) => [s.id, s.name]));

  return {
    byStatus: byStatus.map((r) => ({ status: r.status, count: r._count.id })),
    bySite: bySite.map((r) => ({
      siteName: (r.siteId && siteName.get(r.siteId)) || "—",
      count: r._count.id,
    })),
    expiringDocuments: expiring.map((d) => ({
      employeeName: d.employee.fullNameAr,
      cardNumber: d.employee.cardNumber,
      documentTypeAr: d.documentType.nameAr,
      documentTypeEn: d.documentType.nameEn,
      expiresAt: d.expiresAt!.toISOString().slice(0, 10),
    })),
    expiredCount,
    totalActive,
  };
}
