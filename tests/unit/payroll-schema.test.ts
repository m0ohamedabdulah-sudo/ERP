import { describe, expect, it } from "vitest";
import {
  generatePayrollSchema,
  reportQuerySchema,
  createAdjustmentSchema,
  payoutMethodSchema,
} from "../../modules/payroll/payroll.schema";

const EMP_ID = "11111111-1111-1111-1111-111111111111";

describe("generatePayrollSchema", () => {
  it("accepts a valid year/month", () => {
    const r = generatePayrollSchema.parse({ year: 2026, month: 10 });
    expect(r.month).toBe(10);
  });

  it("rejects month 13", () => {
    expect(() => generatePayrollSchema.parse({ year: 2026, month: 13 })).toThrow();
  });

  it("rejects month 0", () => {
    expect(() => generatePayrollSchema.parse({ year: 2026, month: 0 })).toThrow();
  });
});

describe("reportQuerySchema", () => {
  it("coerces string query params", () => {
    const r = reportQuerySchema.parse({ year: "2026", month: "9" });
    expect(r.year).toBe(2026);
    expect(r.month).toBe(9);
  });
});

describe("createAdjustmentSchema", () => {
  it("accepts a fine", () => {
    const r = createAdjustmentSchema.parse({
      employeeId: EMP_ID,
      year: 2026,
      month: 10,
      kind: "FINE",
      amount: 500,
    });
    expect(r.kind).toBe("FINE");
  });

  it("rejects a negative amount", () => {
    expect(() =>
      createAdjustmentSchema.parse({
        employeeId: EMP_ID,
        year: 2026,
        month: 10,
        kind: "BONUS",
        amount: -100,
      }),
    ).toThrow();
  });

  it("rejects an unknown kind", () => {
    expect(() =>
      createAdjustmentSchema.parse({
        employeeId: EMP_ID,
        year: 2026,
        month: 10,
        kind: "LOTTERY",
        amount: 100,
      }),
    ).toThrow();
  });
});

describe("payoutMethodSchema", () => {
  it("accepts bank transfer with account", () => {
    const r = payoutMethodSchema.parse({
      payoutMethod: "BANK_TRANSFER",
      bankAccount: "1234567890",
    });
    expect(r.payoutMethod).toBe("BANK_TRANSFER");
  });

  it("rejects an unknown method", () => {
    expect(() => payoutMethodSchema.parse({ payoutMethod: "CRYPTO" })).toThrow();
  });
});
