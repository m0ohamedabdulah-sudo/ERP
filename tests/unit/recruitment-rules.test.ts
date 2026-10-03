/**
 * Unit tests for modules/recruitment/recruitment.rules.ts — pure functions, no DB.
 */
import { describe, expect, it } from "vitest";
import {
  assertCandidateTransition,
  canApproveCandidate,
  canTransitionCandidate,
  TERMINAL_STATUSES,
  type CandidateStatusV,
} from "../../modules/recruitment/recruitment.rules";

const ALL: CandidateStatusV[] = [
  "NEW",
  "SCREENING",
  "INTERVIEW",
  "MEDICAL_SECURITY_CHECK",
  "APPROVED",
  "REJECTED",
  "HIRED",
];

describe("candidate status transitions", () => {
  it("allows the documented lifecycle", () => {
    expect(canTransitionCandidate("NEW", "SCREENING")).toBe(true);
    expect(canTransitionCandidate("NEW", "REJECTED")).toBe(true);
    expect(canTransitionCandidate("SCREENING", "INTERVIEW")).toBe(true);
    expect(canTransitionCandidate("INTERVIEW", "MEDICAL_SECURITY_CHECK")).toBe(
      true,
    );
    expect(
      canTransitionCandidate("MEDICAL_SECURITY_CHECK", "APPROVED"),
    ).toBe(true);
    expect(
      canTransitionCandidate("MEDICAL_SECURITY_CHECK", "REJECTED"),
    ).toBe(true);
    expect(canTransitionCandidate("APPROVED", "REJECTED")).toBe(true);
  });

  it("never allows skipping a stage forward", () => {
    expect(canTransitionCandidate("NEW", "INTERVIEW")).toBe(false);
    expect(canTransitionCandidate("NEW", "APPROVED")).toBe(false);
    expect(canTransitionCandidate("SCREENING", "APPROVED")).toBe(false);
    expect(canTransitionCandidate("SCREENING", "MEDICAL_SECURITY_CHECK")).toBe(
      false,
    );
  });

  it("never allows moving backwards", () => {
    expect(canTransitionCandidate("SCREENING", "NEW")).toBe(false);
    expect(canTransitionCandidate("INTERVIEW", "SCREENING")).toBe(false);
    expect(
      canTransitionCandidate("MEDICAL_SECURITY_CHECK", "INTERVIEW"),
    ).toBe(false);
    expect(canTransitionCandidate("APPROVED", "INTERVIEW")).toBe(false);
  });

  it("rejects transitions out of terminal states and any move into HIRED", () => {
    const REACHES_REJECTED: CandidateStatusV[] = [
      "NEW",
      "SCREENING",
      "INTERVIEW",
      "MEDICAL_SECURITY_CHECK",
      "APPROVED",
    ];
    for (const s of REACHES_REJECTED) {
      expect(canTransitionCandidate(s, "REJECTED")).toBe(true);
    }
    for (const terminal of TERMINAL_STATUSES) {
      for (const s of ALL) {
        expect(canTransitionCandidate(terminal, s)).toBe(false);
      }
    }
    for (const s of ALL) {
      expect(canTransitionCandidate(s, "HIRED")).toBe(false);
    }
    expect(canTransitionCandidate("REJECTED", "NEW")).toBe(false);
    expect(canTransitionCandidate("HIRED", "APPROVED")).toBe(false);
  });

  it("rejects direct transition to HIRED — hire action only", () => {
    for (const s of ALL) {
      expect(canTransitionCandidate(s, "HIRED")).toBe(false);
    }
    expect(() => assertCandidateTransition("APPROVED", "HIRED")).toThrow(
      /INVALID_TRANSITION/,
    );
  });

  it("assertCandidateTransition throws on illegal transitions", () => {
    expect(() => assertCandidateTransition("NEW", "SCREENING")).not.toThrow();
    expect(() => assertCandidateTransition("NEW", "APPROVED")).toThrow(
      /INVALID_TRANSITION: cannot move candidate from NEW to APPROVED/,
    );
    expect(() => assertCandidateTransition("HIRED", "NEW")).toThrow(
      /INVALID_TRANSITION/,
    );
  });
});

describe("canApproveCandidate", () => {
  it("requires at least one PASSED interview", () => {
    expect(canApproveCandidate(["PASSED"])).toBe(true);
    expect(canApproveCandidate(["PENDING", "PASSED", "FAILED"])).toBe(true);
  });

  it("rejects empty, pending, failed or no-show histories", () => {
    expect(canApproveCandidate([])).toBe(false);
    expect(canApproveCandidate(["PENDING"])).toBe(false);
    expect(canApproveCandidate(["FAILED"])).toBe(false);
    expect(canApproveCandidate(["NO_SHOW"])).toBe(false);
    expect(canApproveCandidate(["FAILED", "NO_SHOW", "PENDING"])).toBe(false);
  });
});
