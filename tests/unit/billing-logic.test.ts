/**
 * Unit tests for modules/billing/billing.logic.ts — pure functions, no DB.
 */
import { describe, expect, it } from "vitest";
import {
  buildInvoiceLines,
  computeTotals,
  isOverdue,
  nextDocNumber,
  pickRate,
  statusAfterPayment,
  assertInvoiceTransition,
  type AttendanceDay,
  type RateCandidate,
} from "../../modules/billing/billing.logic";

const D = (s: string) => new Date(`${s}T00:00:00`);

function rate(over: Partial<RateCandidate> = {}): RateCandidate {
  return {
    id: "r1",
    contractSiteId: "cs1",
    shiftId: null,
    positionId: null,
    ratePerShift: 250,
    effectiveFrom: D("2026-01-01"),
    effectiveTo: null,
    ...over,
  };
}

function day(over: Partial<AttendanceDay> = {}): AttendanceDay {
  return {
    date: D("2026-08-05"),
    contractSiteId: "cs1",
    shiftId: "sh1",
    positionId: "pos1",
    siteNameAr: "زيا مول",
    siteNameEn: "Zia Mall",
    shiftName: "Morning",
    serviceType: "STATIC_GUARD",
    ...over,
  };
}

describe("pickRate", () => {
  it("prefers the most specific rate (shift+position > shift > generic)", () => {
    const rates = [
      rate({ id: "generic", shiftId: null, positionId: null, ratePerShift: 200 }),
      rate({ id: "shift", shiftId: "sh1", positionId: null, ratePerShift: 250 }),
      rate({
        id: "full",
        shiftId: "sh1",
        positionId: "pos1",
        ratePerShift: 300,
      }),
    ];
    expect(pickRate(rates, "cs1", "sh1", "pos1", D("2026-08-05"))?.id).toBe("full");
    expect(pickRate(rates, "cs1", "sh1", "posX", D("2026-08-05"))?.id).toBe("shift");
    expect(pickRate(rates, "cs1", "shX", "posX", D("2026-08-05"))?.id).toBe("generic");
  });

  it("ignores rates not effective on the day", () => {
    const rates = [
      rate({ id: "old", effectiveFrom: D("2026-01-01"), effectiveTo: D("2026-06-30") }),
      rate({ id: "new", effectiveFrom: D("2026-07-01"), effectiveTo: null }),
    ];
    expect(pickRate(rates, "cs1", "sh1", "pos1", D("2026-08-05"))?.id).toBe("new");
    expect(pickRate(rates, "cs1", "sh1", "pos1", D("2026-03-05"))?.id).toBe("old");
  });

  it("returns null when nothing matches", () => {
    expect(pickRate([rate()], "cs-other", "sh1", "pos1", D("2026-08-05"))).toBeNull();
  });

  it("compares dates on calendar days, ignoring time", () => {
    const rates = [
      rate({ id: "a", effectiveFrom: new Date("2026-08-01T23:59:59") }),
    ];
    expect(pickRate(rates, "cs1", null, null, D("2026-08-01"))?.id).toBe("a");
  });
});

describe("buildInvoiceLines", () => {
  it("groups days by (site, shift, rate) with quantities and amounts", () => {
    const days = [
      day({ date: D("2026-08-01"), shiftId: "sh1" }),
      day({ date: D("2026-08-02"), shiftId: "sh1" }),
      day({ date: D("2026-08-03"), shiftId: "sh2", shiftName: "Night" }),
    ];
    const rates = [rate({ ratePerShift: 250 })];
    const { lines, unpriced } = buildInvoiceLines(
      days,
      rates,
      "أغسطس 2026",
      "Aug 2026",
      "attendance:2026-08",
    );
    expect(unpriced).toHaveLength(0);
    expect(lines).toHaveLength(2);
    const morning = lines.find((l) => l.descriptionEn.includes("Morning"))!;
    expect(morning.quantity).toBe(2);
    expect(morning.unitPrice).toBe(250);
    expect(morning.amount).toBe(500);
    expect(morning.attendanceRef).toBe("attendance:2026-08");
  });

  it("reports days with no effective rate as unpriced instead of dropping them", () => {
    const days = [day({ date: D("2026-08-05") })];
    const rates = [
      rate({ effectiveFrom: D("2026-09-01"), effectiveTo: null }),
    ];
    const { lines, unpriced } = buildInvoiceLines(days, rates, "أ", "A", "ref");
    expect(lines).toHaveLength(0);
    expect(unpriced).toHaveLength(1);
  });

  it("returns deterministic ordering", () => {
    const days = [
      day({ shiftId: "sh2", shiftName: "ب", siteNameAr: "ب", siteNameEn: "B" }),
      day({ shiftId: "sh1", shiftName: "أ", siteNameAr: "أ", siteNameEn: "A" }),
    ];
    const a = buildInvoiceLines(days, [rate()], "x", "y", "r").lines;
    const b = buildInvoiceLines([...days].reverse(), [rate()], "x", "y", "r").lines;
    expect(a.map((l) => l.descriptionAr)).toEqual(
      b.map((l) => l.descriptionAr),
    );
  });
});

describe("computeTotals", () => {
  it("applies discount before tax", () => {
    // 1000 − 100 = 900; tax 14% → 126; total 1026
    expect(computeTotals(1000, 100, 0.14)).toEqual({
      subtotal: 1000,
      discountAmount: 100,
      taxAmount: 126,
      total: 1026,
    });
  });

  it("clamps discount to subtotal and rounds to 2 decimals", () => {
    const t = computeTotals(99.995, 200, 0.1);
    expect(t.discountAmount).toBeLessThanOrEqual(t.subtotal);
    expect(t.total).toBe(Math.round(t.total * 100) / 100);
  });

  it("rejects negative inputs", () => {
    expect(() => computeTotals(-1, 0, 0)).toThrow();
  });
});

describe("nextDocNumber", () => {
  it("formats INV/PAY numbers with zero-padded sequence", () => {
    expect(nextDocNumber("INV", 2026, 0)).toBe("INV-2026-0001");
    expect(nextDocNumber("INV", 2026, 41)).toBe("INV-2026-0042");
    expect(nextDocNumber("PAY", 2026, 7)).toBe("PAY-2026-0008");
  });

  it("rejects invalid lastValue", () => {
    expect(() => nextDocNumber("INV", 2026, -1)).toThrow();
  });
});

describe("invoice status machine", () => {
  it("allows issue/send/cancel/recalculate from the right states", () => {
    expect(() => assertInvoiceTransition("DRAFT", "issue")).not.toThrow();
    expect(() => assertInvoiceTransition("ISSUED", "send")).not.toThrow();
    expect(() => assertInvoiceTransition("DRAFT", "cancel")).not.toThrow();
    expect(() => assertInvoiceTransition("DRAFT", "recalculate")).not.toThrow();
    expect(() => assertInvoiceTransition("DRAFT", "send")).toThrow();
    expect(() => assertInvoiceTransition("PAID", "cancel")).toThrow();
    expect(() => assertInvoiceTransition("SENT", "issue")).toThrow();
  });

  it("moves to PAID when fully paid, PARTIALLY_PAID otherwise", () => {
    expect(statusAfterPayment("SENT", 1000, 1000)).toBe("PAID");
    expect(statusAfterPayment("SENT", 1000, 400)).toBe("PARTIALLY_PAID");
    expect(statusAfterPayment("OVERDUE", 1000, 1000)).toBe("PAID");
    expect(() => statusAfterPayment("DRAFT", 1000, 100)).toThrow();
    expect(() => statusAfterPayment("CANCELLED", 1000, 100)).toThrow();
  });

  it("detects overdue only for issued-family statuses past dueDate", () => {
    const past = D("2026-08-01");
    const now = D("2026-09-29");
    expect(isOverdue("SENT", past, now)).toBe(true);
    expect(isOverdue("ISSUED", past, now)).toBe(true);
    expect(isOverdue("PARTIALLY_PAID", past, now)).toBe(true);
    expect(isOverdue("DRAFT", past, now)).toBe(false);
    expect(isOverdue("PAID", past, now)).toBe(false);
    expect(isOverdue("SENT", null, now)).toBe(false);
    expect(isOverdue("SENT", D("2026-12-01"), now)).toBe(false);
  });
});
