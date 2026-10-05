import { describe, expect, it } from "vitest";
import {
  financeQuerySchema,
  operationsQuerySchema,
} from "../../modules/analytics/analytics.schema";

const SITE_ID = "11111111-1111-1111-1111-111111111111";

describe("operationsQuerySchema", () => {
  it("accepts a valid range", () => {
    const r = operationsQuerySchema.parse({
      from: "2026-10-01",
      to: "2026-10-05",
      siteId: SITE_ID,
    });
    expect(r.siteId).toBe(SITE_ID);
  });

  it("accepts a range without site", () => {
    const r = operationsQuerySchema.parse({ from: "2026-10-01", to: "2026-10-05" });
    expect(r.siteId).toBeUndefined();
  });

  it("rejects to before from", () => {
    expect(() =>
      operationsQuerySchema.parse({ from: "2026-10-05", to: "2026-10-01" }),
    ).toThrow();
  });

  it("rejects a malformed date", () => {
    expect(() =>
      operationsQuerySchema.parse({ from: "yesterday", to: "2026-10-05" }),
    ).toThrow();
  });
});

describe("financeQuerySchema", () => {
  it("defaults to 6 months", () => {
    expect(financeQuerySchema.parse({}).months).toBe(6);
  });

  it("rejects more than 24 months", () => {
    expect(() => financeQuerySchema.parse({ months: 25 })).toThrow();
  });
});
