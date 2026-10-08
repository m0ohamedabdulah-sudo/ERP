import { describe, expect, it } from "vitest";
import {
  LATE_GRACE_MINUTES,
  absoluteCheckinUrl,
  cairoWallTime,
  computeCheckinStatus,
  newQrToken,
  qrTokenExpiry,
  toMinutes,
  todayDateStr,
  utcDayStart,
} from "../../modules/operations/operations.service";
import {
  manualCheckinSchema,
  qrCheckinSchema,
  qrCheckoutSchema,
} from "../../modules/operations/operations.schema";

describe("toMinutes", () => {
  it("converts HH:MM to minutes since midnight", () => {
    expect(toMinutes("08:00")).toBe(480);
    expect(toMinutes("22:30")).toBe(1350);
    expect(toMinutes("00:00")).toBe(0);
  });
});

describe("cairoWallTime", () => {
  it("formats a UTC timestamp as Cairo wall-clock time (EEST in October)", () => {
    // 2026-10-08 is EEST (UTC+3)
    expect(cairoWallTime(new Date("2026-10-08T05:00:00Z"))).toBe("08:00");
    expect(cairoWallTime(new Date("2026-10-08T21:45:00Z"))).toBe("00:45");
  });
});

describe("computeCheckinStatus", () => {
  it("is on-time when checking in before the shift starts", () => {
    expect(
      computeCheckinStatus(new Date("2026-10-08T04:50:00Z"), "08:00"), // 07:50 Cairo
    ).toBe("on-time");
  });

  it("honours the grace period after shift start", () => {
    expect(LATE_GRACE_MINUTES).toBe(15);
    expect(
      computeCheckinStatus(new Date("2026-10-08T05:10:00Z"), "08:00"), // 08:10 Cairo
    ).toBe("on-time");
  });

  it("is late once the grace period is exceeded", () => {
    expect(
      computeCheckinStatus(new Date("2026-10-08T05:20:00Z"), "08:00"), // 08:20 Cairo
    ).toBe("late");
  });

  it("is unscheduled with no roster shift", () => {
    expect(computeCheckinStatus(new Date("2026-10-08T05:20:00Z"), null)).toBe("unscheduled");
    expect(computeCheckinStatus(new Date("2026-10-08T05:20:00Z"), undefined)).toBe("unscheduled");
  });
});

describe("todayDateStr / utcDayStart", () => {
  it("formats the operational day as YYYY-MM-DD", () => {
    expect(todayDateStr(new Date("2026-10-08T10:00:00Z"))).toBe("2026-10-08");
  });

  it("returns midnight UTC for a date string", () => {
    expect(utcDayStart("2026-10-08").toISOString()).toBe("2026-10-08T00:00:00.000Z");
  });
});

describe("qrTokenExpiry", () => {
  it("expires at end of the operational day + 6h grace", () => {
    const exp = qrTokenExpiry(new Date("2026-10-08T10:00:00Z"));
    expect(exp.toISOString()).toBe("2026-10-09T06:00:00.000Z");
  });
});

describe("newQrToken", () => {
  it("generates unique URL-safe tokens", () => {
    const a = newQrToken();
    const b = newQrToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("absoluteCheckinUrl", () => {
  it("uses http for localhost", () => {
    const req = new Request("http://x/", { headers: { host: "localhost:3000" } });
    expect(absoluteCheckinUrl(req, "TOK")).toBe("http://localhost:3000/ar/checkin/TOK");
  });

  it("prefers x-forwarded headers (production)", () => {
    const req = new Request("http://x/", {
      headers: {
        host: "internal",
        "x-forwarded-host": "erp.example.com",
        "x-forwarded-proto": "https",
      },
    });
    expect(absoluteCheckinUrl(req, "TOK")).toBe("https://erp.example.com/ar/checkin/TOK");
  });

  it("falls back to localhost when there is no request", () => {
    expect(absoluteCheckinUrl(undefined, "TOK")).toBe("http://localhost:3000/ar/checkin/TOK");
  });
});

describe("qrCheckinSchema", () => {
  it("accepts a token + card number", () => {
    const r = qrCheckinSchema.parse({ qrToken: "abcdefgh", cardNumber: "EMP-2026-001" });
    expect(r.cardNumber).toBe("EMP-2026-001");
  });

  it("rejects a missing card number", () => {
    expect(() => qrCheckinSchema.parse({ qrToken: "abcdefgh" })).toThrow();
  });

  it("rejects an empty token", () => {
    expect(() => qrCheckinSchema.parse({ qrToken: "", cardNumber: "EMP-2026-001" })).toThrow();
  });
});

describe("qrCheckoutSchema", () => {
  it("accepts a token + card number", () => {
    const r = qrCheckoutSchema.parse({ qrToken: "abcdefgh", cardNumber: "EMP-2026-001" });
    expect(r.qrToken).toBe("abcdefgh");
  });
});

describe("manualCheckinSchema", () => {
  const SITE_ID = "11111111-1111-1111-1111-111111111111";

  it("accepts a check-in with optional note", () => {
    const r = manualCheckinSchema.parse({
      employeeId: SITE_ID,
      siteId: SITE_ID,
      action: "in",
      note: "supervisor entry",
    });
    expect(r.action).toBe("in");
    expect(r.note).toBe("supervisor entry");
  });

  it("accepts a check-out without a note", () => {
    const r = manualCheckinSchema.parse({
      employeeId: SITE_ID,
      siteId: SITE_ID,
      action: "out",
    });
    expect(r.note).toBeUndefined();
  });

  it("rejects a non-uuid employee id", () => {
    expect(() =>
      manualCheckinSchema.parse({ employeeId: "nope", siteId: SITE_ID, action: "in" }),
    ).toThrow();
  });

  it("rejects an unknown action", () => {
    expect(() =>
      manualCheckinSchema.parse({ employeeId: SITE_ID, siteId: SITE_ID, action: "maybe" }),
    ).toThrow();
  });
});
