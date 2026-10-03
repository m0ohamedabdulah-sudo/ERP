/**
 * Recruitment pure logic (no Prisma, no I/O) — unit-testable without a DB.
 *
 * Status machine:
 *   NEW → SCREENING | REJECTED
 *   SCREENING → INTERVIEW | REJECTED
 *   INTERVIEW → MEDICAL_SECURITY_CHECK | REJECTED
 *   MEDICAL_SECURITY_CHECK → APPROVED | REJECTED
 *   APPROVED → REJECTED          (HIRED only via the hire action)
 *   REJECTED and HIRED are terminal.
 */
import type { InterviewResult } from "@prisma/client";

export type CandidateStatusV =
  | "NEW"
  | "SCREENING"
  | "INTERVIEW"
  | "MEDICAL_SECURITY_CHECK"
  | "APPROVED"
  | "REJECTED"
  | "HIRED";

export const TERMINAL_STATUSES: CandidateStatusV[] = ["REJECTED", "HIRED"];

const TRANSITIONS: Record<CandidateStatusV, CandidateStatusV[]> = {
  NEW: ["SCREENING", "REJECTED"],
  SCREENING: ["INTERVIEW", "REJECTED"],
  INTERVIEW: ["MEDICAL_SECURITY_CHECK", "REJECTED"],
  MEDICAL_SECURITY_CHECK: ["APPROVED", "REJECTED"],
  APPROVED: ["REJECTED"],
  REJECTED: [],
  HIRED: [],
};

export function canTransitionCandidate(
  from: CandidateStatusV,
  to: CandidateStatusV,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertCandidateTransition(
  from: CandidateStatusV,
  to: CandidateStatusV,
): void {
  if (!canTransitionCandidate(from, to)) {
    throw new Error(
      `INVALID_TRANSITION: cannot move candidate from ${from} to ${to}`,
    );
  }
}

/**
 * Approval gate: a candidate may be approved only when at least one
 * interview was PASSED. PENDING/FAILED/NO_SHOW interviews do not count.
 */
export function canApproveCandidate(
  interviewResults: InterviewResult[],
): boolean {
  return interviewResults.includes("PASSED");
}
