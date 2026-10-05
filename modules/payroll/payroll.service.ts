import { Prisma, PayrollAdjustmentKind, PayoutMethod } from "@prisma/client";
import { ApiError } from "../../lib/api-response";
import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../lib/audit";
import type { Actor } from "../../lib/auth";
import type {
  GeneratePayrollInput,
  ReportQuery,
  CreateAdjustmentInput,
  AdjustmentQuery,
} from "./payroll.schema";

/**
 * Payroll business logic + audit.
 *
 * Native to the ERP data model:
 *   dailyRate   = salary / daysInMonth
 *   basePay     = totalP × dailyRate        (totalP = Σ code.dayValue for present codes)
 *   deductions  = Σ adjustments(FINE, CUT)
 *   advances    = Σ adjustments(ADVANCE)
 *   bonus       = Σ adjustments(BONUS, ALLOWANCE)
 *   netPay      = basePay − deductions − advances + bonus
 *
 * Absence needs no separate penalty: absent codes carry dayValue 0
 * (and X carries −2), so they simply don't contribute to totalP.
 */

const DEDUCTION_KINDS: PayrollAdjustmentKind[] = [
  PayrollAdjustmentKind.FINE,
  PayrollAdjustmentKind.CUT,
];
const ADDITION_KINDS: PayrollAdjustmentKind[] = [
  PayrollAdjustmentKind.BONUS,
  PayrollAdjustmentKind.ALLOWANCE,
];

export interface PayrollRecordDto {
  id: string;
  employeeId: string;
  cardNumber: string;
  fullNameAr: string;
  siteName: string;
  payoutMethod: string;
  periodYear: number;
  periodMonth: number;
  basicSalary: number;
  attendanceDays: number;
  totalP: number;
  absenceDays: number;
  doubleAbsenceDays: number;
  leaveDays: number;
  deductions: number;
  advances: number;
  bonus: number;
  netPay: number;
  status: string;
}

export interface AdjustmentDto {
  id: string;
  employeeId: string;
  kind: string;
  amount: number;
  notes: string | null;
  createdAt: string;
}

interface ComputedPay {
  basicSalary: number;
  attendanceDays: number;
  totalP: number;
  absenceDays: number;
  doubleAbsenceDays: number;
  leaveDays: number;
  deductions: number;
  advances: number;
  bonus: number;
  netPay: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function monthRange(year: number, month: number): { start: Date; end: Date } {
  // month is 1-based; Date.UTC month is 0-based.
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Compute one employee's pay for the month from attendance + adjustments. */
async function computePay(
  db: Prisma.TransactionClient,
  employeeId: string,
  salary: number,
  year: number,
  month: number,
): Promise<ComputedPay> {
  const { start, end } = monthRange(year, month);
  const records = await db.attendance.findMany({
    where: { employeeId, date: { gte: start, lt: end } },
    include: { code: true },
  });

  let totalP = 0;
  let absenceDays = 0;
  let doubleAbsenceDays = 0;
  let leaveDays = 0;
  for (const r of records) {
    const dv = Number(r.code.dayValue);
    if (r.code.countsAsPresent) {
      totalP += dv;
    } else if (r.code.code === "ABSENT") {
      absenceDays += 1;
    } else if (r.code.code === "DOUBLE_ABSENT") {
      doubleAbsenceDays += 1;
    } else {
      leaveDays += 1;
    }
  }

  const adjustments = await db.payrollAdjustment.findMany({
    where: { employeeId, periodYear: year, periodMonth: month },
  });
  let deductions = 0;
  let advances = 0;
  let bonus = 0;
  for (const a of adjustments) {
    const amt = Number(a.amount);
    if (DEDUCTION_KINDS.includes(a.kind)) deductions += amt;
    else if (a.kind === PayrollAdjustmentKind.ADVANCE) advances += amt;
    else if (ADDITION_KINDS.includes(a.kind)) bonus += amt;
  }

  const dailyRate = salary > 0 ? salary / daysInMonth(year, month) : 0;
  const basePay = totalP * dailyRate;
  const netPay = round2(basePay - deductions - advances + bonus);

  return {
    basicSalary: round2(salary),
    attendanceDays: records.length,
    totalP: round2(totalP),
    absenceDays,
    doubleAbsenceDays,
    leaveDays,
    deductions: round2(deductions),
    advances: round2(advances),
    bonus: round2(bonus),
    netPay,
  };
}

async function upsertRecord(
  db: Prisma.TransactionClient,
  employee: { id: string; salary: Prisma.Decimal | null },
  year: number,
  month: number,
): Promise<void> {
  const pay = await computePay(
    db,
    employee.id,
    employee.salary === null ? 0 : employee.salary.toNumber(),
    year,
    month,
  );
  await db.payrollRecord.upsert({
    where: {
      employeeId_periodYear_periodMonth: {
        employeeId: employee.id,
        periodYear: year,
        periodMonth: month,
      },
    },
    create: {
      employeeId: employee.id,
      periodYear: year,
      periodMonth: month,
      basicSalary: new Prisma.Decimal(pay.basicSalary),
      attendanceDays: new Prisma.Decimal(pay.attendanceDays),
      totalP: new Prisma.Decimal(pay.totalP),
      absenceDays: new Prisma.Decimal(pay.absenceDays),
      doubleAbsenceDays: pay.doubleAbsenceDays,
      leaveDays: pay.leaveDays,
      deductions: new Prisma.Decimal(pay.deductions),
      advances: new Prisma.Decimal(pay.advances),
      bonus: new Prisma.Decimal(pay.bonus),
      netPay: new Prisma.Decimal(pay.netPay),
      status: "DRAFT",
      computedAt: new Date(),
    },
    update: {
      basicSalary: new Prisma.Decimal(pay.basicSalary),
      attendanceDays: new Prisma.Decimal(pay.attendanceDays),
      totalP: new Prisma.Decimal(pay.totalP),
      absenceDays: new Prisma.Decimal(pay.absenceDays),
      doubleAbsenceDays: pay.doubleAbsenceDays,
      leaveDays: pay.leaveDays,
      deductions: new Prisma.Decimal(pay.deductions),
      advances: new Prisma.Decimal(pay.advances),
      bonus: new Prisma.Decimal(pay.bonus),
      netPay: new Prisma.Decimal(pay.netPay),
      computedAt: new Date(),
    },
  });
}

/** (Re)generate payroll for every active employee for the month. */
export async function generatePayroll(
  actor: Actor,
  input: GeneratePayrollInput,
  req?: Request,
): Promise<{ generated: number; year: number; month: number }> {
  const employees = await prisma.employee.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
    select: { id: true, salary: true },
  });

  await prisma.$transaction(async (tx) => {
    for (const e of employees) {
      await upsertRecord(tx, e, input.year, input.month);
    }
    await writeAudit(
      tx,
      actor,
      {
        action: "payroll.generate",
        module: "payroll",
        recordId: `${input.year}-${input.month}`,
        newValue: { year: input.year, month: input.month, generated: employees.length },
      },
      req,
    );
  });

  return { generated: employees.length, year: input.year, month: input.month };
}

/** Payroll report for the month, optionally filtered by site. */
export async function getPayrollReport(query: ReportQuery): Promise<{
  records: PayrollRecordDto[];
  totals: { employees: number; totalNet: number; totalDeductions: number; totalBonus: number };
}> {
  const where: Prisma.PayrollRecordWhereInput = {
    periodYear: query.year,
    periodMonth: query.month,
  };
  if (query.siteId) {
    where.employee = { siteId: query.siteId };
  }
  const rows = await prisma.payrollRecord.findMany({
    where,
    include: {
      employee: {
        select: {
          cardNumber: true,
          fullNameAr: true,
          payoutMethod: true,
          site: { select: { name: true } },
        },
      },
    },
    orderBy: { employee: { fullNameAr: "asc" } },
  });

  const records: PayrollRecordDto[] = rows.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    cardNumber: r.employee.cardNumber,
    fullNameAr: r.employee.fullNameAr,
    siteName: r.employee.site.name,
    payoutMethod: r.employee.payoutMethod,
    periodYear: r.periodYear,
    periodMonth: r.periodMonth,
    basicSalary: Number(r.basicSalary),
    attendanceDays: Number(r.attendanceDays),
    totalP: Number(r.totalP),
    absenceDays: Number(r.absenceDays),
    doubleAbsenceDays: r.doubleAbsenceDays,
    leaveDays: r.leaveDays,
    deductions: Number(r.deductions),
    advances: Number(r.advances),
    bonus: Number(r.bonus),
    netPay: Number(r.netPay),
    status: r.status,
  }));

  const totals = {
    employees: records.length,
    totalNet: round2(records.reduce((s, r) => s + r.netPay, 0)),
    totalDeductions: round2(records.reduce((s, r) => s + r.deductions, 0)),
    totalBonus: round2(records.reduce((s, r) => s + r.bonus, 0)),
  };
  return { records, totals };
}

/** Add a financial effect and recompute the employee's record. */
export async function createAdjustment(
  actor: Actor,
  input: CreateAdjustmentInput,
  req?: Request,
): Promise<AdjustmentDto> {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, deletedAt: null },
    select: { id: true, salary: true },
  });
  if (!employee) throw new ApiError("NOT_FOUND", "Employee not found", 404);

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.payrollAdjustment.create({
      data: {
        employeeId: employee.id,
        periodYear: input.year,
        periodMonth: input.month,
        kind: input.kind,
        amount: new Prisma.Decimal(input.amount),
        notes: input.notes?.trim() || null,
      },
    });
    await upsertRecord(tx, employee, input.year, input.month);
    await writeAudit(
      tx,
      actor,
      {
        action: "payroll.adjustment.create",
        module: "payroll",
        recordId: row.id,
        newValue: {
          employeeId: employee.id,
          kind: input.kind,
          amount: input.amount,
        },
      },
      req,
    );
    return row;
  });

  return {
    id: created.id,
    employeeId: created.employeeId,
    kind: created.kind,
    amount: Number(created.amount),
    notes: created.notes,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function listAdjustments(
  query: AdjustmentQuery,
): Promise<AdjustmentDto[]> {
  const rows = await prisma.payrollAdjustment.findMany({
    where: {
      employeeId: query.employeeId,
      periodYear: query.year,
      periodMonth: query.month,
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    kind: r.kind,
    amount: Number(r.amount),
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Delete a financial effect and recompute the employee's record. */
export async function deleteAdjustment(
  actor: Actor,
  id: string,
  req?: Request,
): Promise<void> {
  const existing = await prisma.payrollAdjustment.findUnique({
    where: { id },
    include: { employee: { select: { id: true, salary: true } } },
  });
  if (!existing) throw new ApiError("NOT_FOUND", "Adjustment not found", 404);

  await prisma.$transaction(async (tx) => {
    await tx.payrollAdjustment.delete({ where: { id } });
    await upsertRecord(
      tx,
      existing.employee,
      existing.periodYear,
      existing.periodMonth,
    );
    await writeAudit(
      tx,
      actor,
      {
        action: "payroll.adjustment.delete",
        module: "payroll",
        recordId: id,
        oldValue: { kind: existing.kind, amount: Number(existing.amount) },
      },
      req,
    );
  });
}

/** Lock the month: DRAFT → FINALIZED. */
export async function finalizePayroll(
  actor: Actor,
  input: GeneratePayrollInput,
  req?: Request,
): Promise<{ finalized: number }> {
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.payrollRecord.updateMany({
      where: {
        periodYear: input.year,
        periodMonth: input.month,
        status: "DRAFT",
      },
      data: { status: "FINALIZED" },
    });
    await writeAudit(
      tx,
      actor,
      {
        action: "payroll.finalize",
        module: "payroll",
        recordId: `${input.year}-${input.month}`,
        newValue: { year: input.year, month: input.month, finalized: updated.count },
      },
      req,
    );
    return updated;
  });
  return { finalized: result.count };
}

/** Set an employee's payout method (bank transfers). */
export async function setPayoutMethod(
  actor: Actor,
  employeeId: string,
  payoutMethod: PayoutMethod,
  bankAccount: string | undefined,
  req?: Request,
): Promise<void> {
  const existing = await prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
  });
  if (!existing) throw new ApiError("NOT_FOUND", "Employee not found", 404);
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id: employeeId },
      data: {
        payoutMethod,
        bankAccount: bankAccount?.trim() || null,
      },
    });
    await writeAudit(
      tx,
      actor,
      {
        action: "payroll.payout.update",
        module: "payroll",
        recordId: employeeId,
        newValue: { payoutMethod },
      },
      req,
    );
  });
}
