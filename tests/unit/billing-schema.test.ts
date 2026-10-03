/**
 * Unit tests for modules/billing/billing.schema.ts — Zod input validation.
 */
import { describe, expect, it } from "vitest";
import {
  generateInvoiceSchema,
  invoiceQuerySchema,
  invoiceTransitionSchema,
  parseDateOnly,
  recordPaymentSchema,
} from "../../modules/billing/billing.schema";

const UUID = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

const validGenerate = {
  contractId: UUID,
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
};

describe("parseDateOnly", () => {
  it("parses YYYY-MM-DD to a local-midnight date (no TZ shift)", () => {
    const d = parseDateOnly("2026-08-15");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("rejects malformed strings and impossible dates", () => {
    expect(() => parseDateOnly("15/08/2026")).toThrow();
    expect(() => parseDateOnly("2026-8-15")).toThrow();
    expect(() => parseDateOnly("2026-02-30")).toThrow();
    expect(() => parseDateOnly("not-a-date")).toThrow();
  });
});

describe("generateInvoiceSchema", () => {
  it("valid input passes with defaults (taxRate 0, discountAmount 0)", () => {
    const out = generateInvoiceSchema.parse(validGenerate);
    expect(out.taxRate).toBe(0);
    expect(out.discountAmount).toBe(0);
    expect(out.periodStart).toBeInstanceOf(Date);
    expect(out.periodEnd).toBeInstanceOf(Date);
    expect(out.periodStart.getDate()).toBe(1);
  });

  it("equal start/end is allowed", () => {
    const out = generateInvoiceSchema.parse({
      ...validGenerate,
      periodEnd: "2026-08-01",
    });
    expect(out.periodStart.getTime()).toBe(out.periodEnd.getTime());
  });

  it("fails when periodStart is after periodEnd", () => {
    expect(() =>
      generateInvoiceSchema.parse({
        ...validGenerate,
        periodStart: "2026-09-01",
        periodEnd: "2026-08-31",
      }),
    ).toThrow();
  });

  it("fails on bad date format", () => {
    expect(() =>
      generateInvoiceSchema.parse({ ...validGenerate, periodStart: "08/01/2026" }),
    ).toThrow();
    expect(() =>
      generateInvoiceSchema.parse({ ...validGenerate, periodEnd: "2026-02-30" }),
    ).toThrow();
  });

  it("fails on invalid contractId", () => {
    expect(() =>
      generateInvoiceSchema.parse({ ...validGenerate, contractId: "nope" }),
    ).toThrow();
  });

  it("rejects negative discount and out-of-range taxRate", () => {
    expect(() =>
      generateInvoiceSchema.parse({ ...validGenerate, discountAmount: -1 }),
    ).toThrow();
    expect(() =>
      generateInvoiceSchema.parse({ ...validGenerate, taxRate: 1.5 }),
    ).toThrow();
    expect(() =>
      generateInvoiceSchema.parse({ ...validGenerate, taxRate: -0.1 }),
    ).toThrow();
  });
});

describe("recordPaymentSchema", () => {
  const validPayment = {
    amount: 1250.5,
    paidAt: "2026-09-10",
    method: "BANK_TRANSFER",
  };

  it("valid payment passes; paidAt becomes a Date", () => {
    const out = recordPaymentSchema.parse(validPayment);
    expect(out.amount).toBe(1250.5);
    expect(out.paidAt.getFullYear()).toBe(2026);
    expect(out.paidAt.getMonth()).toBe(8);
    expect(out.reference).toBeUndefined();
  });

  it("rejects zero and negative amounts", () => {
    expect(() =>
      recordPaymentSchema.parse({ ...validPayment, amount: 0 }),
    ).toThrow();
    expect(() =>
      recordPaymentSchema.parse({ ...validPayment, amount: -100 }),
    ).toThrow();
  });

  it("rejects unknown payment method", () => {
    expect(() =>
      recordPaymentSchema.parse({ ...validPayment, method: "BITCOIN" }),
    ).toThrow();
  });

  it("accepts every PaymentMethod enum value", () => {
    for (const method of ["CASH", "BANK_TRANSFER", "CHECK", "ELECTRONIC"]) {
      expect(recordPaymentSchema.parse({ ...validPayment, method }).method).toBe(
        method,
      );
    }
  });
});

describe("invoiceTransitionSchema", () => {
  it("accepts issue / send / cancel", () => {
    for (const transition of ["issue", "send", "cancel"] as const) {
      expect(invoiceTransitionSchema.parse({ transition }).transition).toBe(
        transition,
      );
    }
  });

  it("rejects unknown transitions", () => {
    expect(() =>
      invoiceTransitionSchema.parse({ transition: "recalculate" }),
    ).toThrow();
    expect(() =>
      invoiceTransitionSchema.parse({ transition: "ISSUE" }),
    ).toThrow();
    expect(() => invoiceTransitionSchema.parse({})).toThrow();
  });
});

describe("invoiceQuerySchema", () => {
  it("defaults page/pageSize and coerces strings", () => {
    const out = invoiceQuerySchema.parse({});
    expect(out.page).toBe(1);
    expect(out.pageSize).toBe(20);

    const coerced = invoiceQuerySchema.parse({ page: "3", pageSize: "50" });
    expect(coerced.page).toBe(3);
    expect(coerced.pageSize).toBe(50);
  });

  it("caps pageSize at 100", () => {
    expect(invoiceQuerySchema.parse({ pageSize: "999" }).pageSize).toBe(100);
  });

  it("accepts status enum and date range filters", () => {
    const out = invoiceQuerySchema.parse({
      status: "OVERDUE",
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(out.status).toBe("OVERDUE");
    expect(out.from).toBeInstanceOf(Date);
    expect(out.to).toBeInstanceOf(Date);
  });

  it("rejects unknown status", () => {
    expect(() => invoiceQuerySchema.parse({ status: "DRAFTY" })).toThrow();
  });
});
