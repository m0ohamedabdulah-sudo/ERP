/**
 * Payroll-ready attendance computation (docs/PHASE4.md §3).
 *
 * This is payroll *preparation*, not an accounting system: it turns a
 * month of attendance into a payable line item. All rates come from the
 * caller (persisted payroll rules in production) — never hard-coded.
 *
 * Formula:
 *   overtimePay      = overtimeHours × overtimeRatePerHour
 *   absenceDeduction = absences × absenceDeductionPerDay
 *   xDeduction       = xDays × absenceDeductionPerDay × xDayMultiplier
 *   leaveDeduction   = leaveDays × absenceDeductionPerDay
 *   netPay           = basicSalary + overtimePay
 *                      − absenceDeduction − xDeduction
 *                      − leaveDeduction − advances
 *
 * Notes:
 * - `leaveDays` are *unpaid* leave days. Whether AL/SL days are paid is a
 *   policy flag resolved by the caller before invoking this function
 *   (PHASE4.md: "AL/SL days are paid per policy flags in the rules").
 * - `xDayMultiplier` scales the daily deduction for X-coded days
 *   (absence counted as multiple days; default 2 per docs).
 */

export interface PayrollRules {
  /** Currency deducted per absence (A-coded) day. */
  absenceDeductionPerDay: number;
  /** Multiplier on the daily deduction applied per X-coded day. */
  xDayMultiplier: number;
  /** Currency paid per overtime hour. */
  overtimeRatePerHour: number;
}

export interface PayrollInput {
  basicSalary: number;
  /** Σ day values for the period (docs/PHASE3.md §1); informational here. */
  totalP: number;
  /** Count of A-coded days. */
  absences: number;
  /** Count of X-coded days. */
  xDays: number;
  /** Unpaid leave days in the period. */
  leaveDays: number;
  overtimeHours: number;
  advances: number;
  rules: PayrollRules;
}

export interface PayrollResult {
  basicSalary: number;
  overtimePay: number;
  absenceDeduction: number;
  xDeduction: number;
  leaveDeduction: number;
  advances: number;
  netPay: number;
}

export function computeNetPay(input: PayrollInput): PayrollResult {
  const { basicSalary, absences, xDays, leaveDays, overtimeHours, advances, rules } = input;
  for (const [name, v] of Object.entries({ basicSalary, absences, xDays, leaveDays, overtimeHours, advances }) as Array<[string, number]>) {
    if (!Number.isFinite(v) || v < 0) {
      throw new Error(`${name} must be a non-negative number`);
    }
  }
  const overtimePay = overtimeHours * rules.overtimeRatePerHour;
  const absenceDeduction = absences * rules.absenceDeductionPerDay;
  const xDeduction = xDays * rules.absenceDeductionPerDay * rules.xDayMultiplier;
  const leaveDeduction = leaveDays * rules.absenceDeductionPerDay;
  const netPay = basicSalary + overtimePay - absenceDeduction - xDeduction - leaveDeduction - advances;
  return {
    basicSalary,
    overtimePay: round2(overtimePay),
    absenceDeduction: round2(absenceDeduction),
    xDeduction: round2(xDeduction),
    leaveDeduction: round2(leaveDeduction),
    advances,
    netPay: round2(netPay),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
