/**
 * Unit tests for modules/compliance/compliance.rules.ts — pure functions, no DB.
 */
import { describe, expect, it } from "vitest";
import {
  EXPIRY_WARNING_DAYS,
  buildExpiryNotification,
  computeDocumentStatus,
  defaultExpiresAt,
  evaluateDocumentReason,
  shouldSkipExpiryNotification,
} from "../../modules/compliance/compliance.rules";

const D = (s: string) => new Date(`${s}T00:00:00Z`);
// "now" at 2026-09-29 12:00 — mid-day so calendar boundaries matter.
const NOW = new Date("2026-09-29T12:00:00");

const DAY = 24 * 60 * 60 * 1000;

describe("computeDocumentStatus", () => {
  it("treats a null expiresAt as VALID (never expires)", () => {
    expect(computeDocumentStatus(null, NOW)).toBe("VALID");
  });

  it("marks documents expiring before the start of today as EXPIRED", () => {
    expect(computeDocumentStatus(D("2026-09-28"), NOW)).toBe("EXPIRED");
    // earlier today would be past too (date-only granularity)
    expect(
      computeDocumentStatus(new Date("2026-09-29T00:00:00"), NOW),
    ).not.toBe("EXPIRED");
  });

  it("treats expiry on the day boundary correctly", () => {
    // expires exactly at start of today → not yet EXPIRED (today counts)
    expect(computeDocumentStatus(D("2026-09-29"), NOW)).toBe("EXPIRING_SOON");
  });

  it("uses the warning window inclusively", () => {
    const warning = EXPIRY_WARNING_DAYS;
    // exactly warningDays away → still EXPIRING_SOON (<= now + warningDays)
    expect(
      computeDocumentStatus(new Date(NOW.getTime() + warning * DAY), NOW),
    ).toBe("EXPIRING_SOON");
    // one day beyond the window → VALID
    expect(
      computeDocumentStatus(
        new Date(NOW.getTime() + (warning + 1) * DAY),
        NOW,
      ),
    ).toBe("VALID");
  });

  it("honours a custom warningDays override", () => {
    expect(computeDocumentStatus(D("2026-10-29"), NOW, 31)).toBe(
      "EXPIRING_SOON",
    );
    expect(computeDocumentStatus(D("2026-10-29"), NOW, 29)).toBe("VALID");
  });
});

describe("defaultExpiresAt", () => {
  it("returns null when validityMonths is null (no expiry)", () => {
    expect(defaultExpiresAt(D("2026-01-15"), null)).toBeNull();
  });

  it("adds validity months to the issue date", () => {
    // defaultExpiresAt does calendar arithmetic in local terms, so assert on
    // local components (not toISOString, which is UTC and shifts the day).
    const localDay = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
    const out = defaultExpiresAt(D("2026-01-15"), 3);
    expect(out && localDay(out)).toBe("2026-04-15");
    const year = defaultExpiresAt(D("2026-06-01"), 12);
    expect(year && localDay(year)).toBe("2027-06-01");
  });

  it("clamps month-end days like the calendar does", () => {
    // Jan 31 + 1 month → Feb 28 (non-leap 2026)
    const out = defaultExpiresAt(D("2026-01-31"), 1);
    expect(out?.getFullYear()).toBe(2026);
    expect(out?.getMonth()).toBe(1); // February
    expect(out?.getDate()).toBe(28);
  });
});

describe("evaluateDocumentReason", () => {
  it("maps computeDocumentStatus to the compliance vocabulary", () => {
    expect(evaluateDocumentReason(null, NOW)).toBe("valid");
    expect(evaluateDocumentReason(D("2026-09-28"), NOW)).toBe("expired");
    expect(evaluateDocumentReason(D("2026-10-05"), NOW)).toBe("expiring_soon");
    expect(evaluateDocumentReason(D("2027-01-01"), NOW)).toBe("valid");
  });
});

describe("buildExpiryNotification", () => {
  const info = {
    employeeId: "emp-1",
    employeeNameEn: "Ahmed Ali",
    employeeNameAr: "أحمد علي",
    documentTypeNameEn: "Criminal Record",
    documentTypeNameAr: "فيش جنائي",
    expiresAt: D("2026-10-05"),
  };

  it("builds a DOCUMENT_EXPIRING broadcast draft for a soon-expiry doc", () => {
    const n = buildExpiryNotification({ ...info, expired: false });
    expect(n.type).toBe("DOCUMENT_EXPIRING");
    expect(n.title).toBe("Document expiring: Criminal Record — Ahmed Ali");
    expect(n.titleAr).toBe("مستند على وشك الانتهاء: فيش جنائي — أحمد علي");
    expect(n.body).toContain("2026-10-05");
    expect(n.bodyAr).toContain("2026-10-05");
    expect(n.relatedModule).toBe("compliance");
    expect(n.relatedId).toBe("emp-1");
  });

  it("builds a DOCUMENT_EXPIRED draft for an expired doc", () => {
    const n = buildExpiryNotification({ ...info, expired: true });
    expect(n.type).toBe("DOCUMENT_EXPIRED");
    expect(n.title).toBe("Document expired: Criminal Record — Ahmed Ali");
    expect(n.titleAr).toBe("مستند منتهي: فيش جنائي — أحمد علي");
  });
});

describe("shouldSkipExpiryNotification", () => {
  const draft = { type: "DOCUMENT_EXPIRING", relatedId: "emp-1" };

  it("skips when an unread matching notification was created within 7 days", () => {
    const recent = [
      {
        type: "DOCUMENT_EXPIRING",
        relatedId: "emp-1",
        isRead: false,
        createdAt: new Date(NOW.getTime() - 3 * DAY),
      },
    ];
    expect(shouldSkipExpiryNotification(recent, draft, NOW)).toBe(true);
  });

  it("does not skip when the only match is older than the dedup window", () => {
    const recent = [
      {
        type: "DOCUMENT_EXPIRING",
        relatedId: "emp-1",
        isRead: false,
        createdAt: new Date(NOW.getTime() - 8 * DAY),
      },
    ];
    expect(shouldSkipExpiryNotification(recent, draft, NOW)).toBe(false);
  });

  it("does not skip read, wrong-type, or wrong-employee notifications", () => {
    const recent = [
      {
        type: "DOCUMENT_EXPIRING",
        relatedId: "emp-1",
        isRead: true,
        createdAt: new Date(NOW.getTime() - DAY),
      },
      {
        type: "DOCUMENT_EXPIRED",
        relatedId: "emp-1",
        isRead: false,
        createdAt: new Date(NOW.getTime() - DAY),
      },
      {
        type: "DOCUMENT_EXPIRING",
        relatedId: "emp-2",
        isRead: false,
        createdAt: new Date(NOW.getTime() - DAY),
      },
    ];
    expect(shouldSkipExpiryNotification(recent, draft, NOW)).toBe(false);
  });

  it("does not skip when there is no recent history at all", () => {
    expect(shouldSkipExpiryNotification([], draft, NOW)).toBe(false);
  });
});
