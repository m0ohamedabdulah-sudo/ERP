/**
 * Unit tests for modules/contracts/contract.schema.ts — Zod validation, no DB.
 */
import { describe, expect, it } from "vitest";
import {
  addRateSchema,
  createContractSchema,
  statusTransitionSchema,
  updateContractSchema,
} from "../../modules/contracts/contract.schema";

const UUID = "11111111-2222-4333-8444-555555555555";
const UUID2 = "66666666-7777-4888-8999-000000000000";

type LooseRecord = Record<string, unknown>;

function validRate(over: LooseRecord = {}): LooseRecord {
  return {
    shiftId: UUID2,
    positionId: null,
    ratePerShift: 250,
    ratePerMonth: 7500,
    overtimeRatePerHour: 40,
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    ...over,
  };
}

function validCreate(over: LooseRecord = {}): LooseRecord {
  return {
    clientId: UUID,
    contractNo: "CNT-2026-014",
    titleAr: "عقد حراسة",
    titleEn: "Guarding contract",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    paymentTermsDays: 30,
    sites: [
      {
        siteId: UUID2,
        serviceType: "STATIC_GUARD",
        rates: [validRate()],
      },
    ],
    ...over,
  };
}

function firstSiteRates(payload: LooseRecord): unknown[] {
  const sites = payload.sites as { rates: unknown[] }[] | undefined;
  const site = sites?.[0];
  if (!site) throw new Error("test setup: expected at least one site");
  return site.rates;
}

describe("createContractSchema", () => {
  it("accepts a valid contract", () => {
    const parsed = createContractSchema.parse(validCreate());
    expect(parsed.contractNo).toBe("CNT-2026-014");
    expect(parsed.startDate).toBeInstanceOf(Date);
    expect(parsed.endDate).toBeInstanceOf(Date);
    expect(parsed.paymentTermsDays).toBe(30);
    expect(parsed.sites).toHaveLength(1);
  });

  it("defaults paymentTermsDays to 30", () => {
    const { paymentTermsDays, ...rest } = validCreate();
    void paymentTermsDays;
    expect(createContractSchema.parse(rest).paymentTermsDays).toBe(30);
  });

  it("rejects endDate on or before startDate", () => {
    expect(() =>
      createContractSchema.parse(validCreate({ endDate: "2026-01-01" })),
    ).toThrow();
    expect(() =>
      createContractSchema.parse(validCreate({ endDate: "2025-12-31" })),
    ).toThrow();
  });

  it("rejects malformed dates", () => {
    expect(() =>
      createContractSchema.parse(validCreate({ startDate: "01/01/2026" })),
    ).toThrow();
    expect(() =>
      createContractSchema.parse(validCreate({ startDate: "2026-13-01" })),
    ).toThrow();
    expect(() =>
      createContractSchema.parse(validCreate({ startDate: "2026-02-30" })),
    ).toThrow();
  });

  it("rejects a rate without ratePerShift", () => {
    const { ratePerShift, ...rate } = validRate();
    void ratePerShift;
    expect(() =>
      createContractSchema.parse(validCreate({ sites: [] })),
    ).toThrow(); // sanity: empty sites also rejected
    const payload = validCreate();
    const rates = firstSiteRates(payload);
    rates[0] = rate;
    expect(() => createContractSchema.parse(payload)).toThrow();
  });

  it("rejects effectiveTo before effectiveFrom", () => {
    const payload = validCreate();
    const rates = firstSiteRates(payload);
    rates[0] = validRate({
      effectiveFrom: "2026-06-01",
      effectiveTo: "2026-05-01",
    });
    expect(() => createContractSchema.parse(payload)).toThrow();
  });

  it("rejects negative paymentTermsDays", () => {
    expect(() =>
      createContractSchema.parse(validCreate({ paymentTermsDays: -5 })),
    ).toThrow();
  });
});

describe("addRateSchema", () => {
  it("accepts null shiftId/positionId and missing optional rates", () => {
    const parsed = addRateSchema.parse({
      shiftId: null,
      positionId: null,
      ratePerShift: 100,
      effectiveFrom: "2026-01-01",
    });
    expect(parsed.shiftId).toBeNull();
    expect(parsed.ratePerMonth).toBeUndefined();
    expect(parsed.effectiveTo).toBeUndefined();
  });

  it("rejects non-positive rates", () => {
    expect(() =>
      addRateSchema.parse({ ratePerShift: 0, effectiveFrom: "2026-01-01" }),
    ).toThrow();
    expect(() =>
      addRateSchema.parse({ ratePerShift: -10, effectiveFrom: "2026-01-01" }),
    ).toThrow();
  });
});

describe("updateContractSchema", () => {
  it("accepts a partial update without sites", () => {
    const parsed = updateContractSchema.parse({ notes: "renewed" });
    expect(parsed.notes).toBe("renewed");
    expect(parsed.titleEn).toBeUndefined();
  });

  it("rejects endDate before startDate when both are given", () => {
    expect(() =>
      updateContractSchema.parse({
        startDate: "2026-06-01",
        endDate: "2026-05-01",
      }),
    ).toThrow();
  });

  it("accepts a single date change", () => {
    const parsed = updateContractSchema.parse({ startDate: "2026-02-01" });
    expect(parsed.startDate).toBeInstanceOf(Date);
  });
});

describe("statusTransitionSchema", () => {
  it("accepts every known status", () => {
    for (const to of ["DRAFT", "ACTIVE", "SUSPENDED", "EXPIRED", "TERMINATED"]) {
      expect(statusTransitionSchema.parse({ to }).to).toBe(to);
    }
  });

  it("rejects an unknown status", () => {
    expect(() => statusTransitionSchema.parse({ to: "FROZEN" })).toThrow();
    expect(() => statusTransitionSchema.parse({})).toThrow();
  });
});
