/**
 * Unit tests for modules/contracts/contract.rules.ts — pure functions, no DB.
 */
import { describe, expect, it } from "vitest";
import {
  assertContractTransition,
  canTransitionContract,
  findSiteConflicts,
  periodsOverlap,
  type ContractWindow,
} from "../../modules/contracts/contract.rules";

const D = (s: string) => new Date(`${s}T00:00:00`);

describe("contract status transitions", () => {
  it("allows the documented lifecycle", () => {
    expect(canTransitionContract("DRAFT", "ACTIVE")).toBe(true);
    expect(canTransitionContract("ACTIVE", "SUSPENDED")).toBe(true);
    expect(canTransitionContract("SUSPENDED", "ACTIVE")).toBe(true);
    expect(canTransitionContract("ACTIVE", "EXPIRED")).toBe(true);
    expect(canTransitionContract("ACTIVE", "TERMINATED")).toBe(true);
    expect(canTransitionContract("DRAFT", "TERMINATED")).toBe(true);
    expect(canTransitionContract("SUSPENDED", "TERMINATED")).toBe(true);
  });

  it("rejects illegal transitions and terminal states", () => {
    expect(canTransitionContract("DRAFT", "SUSPENDED")).toBe(false);
    expect(canTransitionContract("ACTIVE", "DRAFT")).toBe(false);
    expect(canTransitionContract("EXPIRED", "ACTIVE")).toBe(false);
    expect(canTransitionContract("TERMINATED", "ACTIVE")).toBe(false);
    expect(() => assertContractTransition("DRAFT", "SUSPENDED")).toThrow(
      /INVALID_TRANSITION/,
    );
  });
});

describe("periodsOverlap", () => {
  it("detects overlapping and adjacent ranges (inclusive)", () => {
    expect(
      periodsOverlap(D("2026-01-01"), D("2026-12-31"), D("2026-06-01"), D("2027-06-01")),
    ).toBe(true);
    expect(
      periodsOverlap(D("2026-01-01"), D("2026-06-30"), D("2026-06-30"), D("2026-12-31")),
    ).toBe(true); // touching on the boundary counts as overlap
    expect(
      periodsOverlap(D("2026-01-01"), D("2026-06-29"), D("2026-06-30"), D("2026-12-31")),
    ).toBe(false);
    expect(
      periodsOverlap(D("2027-01-01"), D("2027-12-31"), D("2026-01-01"), D("2026-12-31")),
    ).toBe(false);
  });
});

describe("findSiteConflicts", () => {
  const existing: ContractWindow[] = [
    {
      id: "c1",
      contractNo: "CNT-2026-001",
      siteIds: ["site-a", "site-b"],
      startDate: D("2026-01-01"),
      endDate: D("2026-12-31"),
      status: "ACTIVE",
    },
    {
      id: "c2",
      contractNo: "CNT-2025-009",
      siteIds: ["site-a"],
      startDate: D("2025-01-01"),
      endDate: D("2025-12-31"),
      status: "EXPIRED",
    },
  ];

  it("flags an active contract on a shared site with overlapping period", () => {
    const conflicts = findSiteConflicts(
      { siteIds: ["site-a"], startDate: D("2026-06-01"), endDate: D("2027-06-01") },
      existing,
    );
    expect(conflicts.map((c) => c.id)).toEqual(["c1"]);
  });

  it("ignores non-active contracts, other sites, and non-overlapping periods", () => {
    expect(
      findSiteConflicts(
        { siteIds: ["site-a"], startDate: D("2025-03-01"), endDate: D("2025-09-01") },
        existing,
      ),
    ).toHaveLength(0); // only EXPIRED contract there
    expect(
      findSiteConflicts(
        { siteIds: ["site-z"], startDate: D("2026-06-01"), endDate: D("2026-09-01") },
        existing,
      ),
    ).toHaveLength(0);
    expect(
      findSiteConflicts(
        { siteIds: ["site-a"], startDate: D("2027-01-01"), endDate: D("2027-12-31") },
        existing,
      ),
    ).toHaveLength(0);
  });

  it("excludes the contract being updated", () => {
    expect(
      findSiteConflicts(
        { siteIds: ["site-a"], startDate: D("2026-06-01"), endDate: D("2026-09-01") },
        existing,
        "c1",
      ),
    ).toHaveLength(0);
  });
});
