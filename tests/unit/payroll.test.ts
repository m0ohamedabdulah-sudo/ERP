import { describe, expect, it } from 'vitest';
import { computeNetPay, type PayrollRules } from '../../src/lib/payroll.js';

const RULES: PayrollRules = {
  absenceDeductionPerDay: 200,
  xDayMultiplier: 2,
  overtimeRatePerHour: 50,
};

describe('computeNetPay', () => {
  it('worked example with hand-computed net pay', () => {
    // overtimePay = 4 × 50 = 200
    // absenceDeduction = 2 × 200 = 400
    // xDeduction = 1 × 200 × 2 = 400
    // netPay = 6000 + 200 − 400 − 400 − 0 − 500 = 4900
    const r = computeNetPay({
      basicSalary: 6000,
      totalP: 26,
      absences: 2,
      xDays: 1,
      leaveDays: 0,
      overtimeHours: 4,
      advances: 500,
      rules: RULES,
    });
    expect(r.overtimePay).toBe(200);
    expect(r.absenceDeduction).toBe(400);
    expect(r.xDeduction).toBe(400);
    expect(r.leaveDeduction).toBe(0);
    expect(r.netPay).toBe(4900);
  });

  it('X-day multiplier scales the daily deduction', () => {
    const base = {
      basicSalary: 6000,
      totalP: 25,
      absences: 0,
      xDays: 2,
      leaveDays: 0,
      overtimeHours: 0,
      advances: 0,
    };
    const doubled = computeNetPay({ ...base, rules: RULES });
    const single = computeNetPay({ ...base, rules: { ...RULES, xDayMultiplier: 1 } });
    // difference = xDays × daily deduction × (2 − 1) = 2 × 200 = 400
    expect(single.netPay - doubled.netPay).toBe(400);
  });

  it('unpaid leave deducts the daily rate', () => {
    const r = computeNetPay({
      basicSalary: 6000,
      totalP: 24,
      absences: 0,
      xDays: 0,
      leaveDays: 3,
      overtimeHours: 0,
      advances: 0,
      rules: RULES,
    });
    expect(r.leaveDeduction).toBe(600);
    expect(r.netPay).toBe(5400);
  });

  it('zero-attendance edge case: all-absent month nets to zero', () => {
    const r = computeNetPay({
      basicSalary: 6000,
      totalP: 0,
      absences: 30,
      xDays: 0,
      leaveDays: 0,
      overtimeHours: 0,
      advances: 0,
      rules: RULES,
    });
    expect(r.netPay).toBe(0);
  });

  it('rejects negative inputs', () => {
    expect(() =>
      computeNetPay({
        basicSalary: 6000,
        totalP: 26,
        absences: -1,
        xDays: 0,
        leaveDays: 0,
        overtimeHours: 0,
        advances: 0,
        rules: RULES,
      }),
    ).toThrow('absences must be a non-negative number');
  });
});
