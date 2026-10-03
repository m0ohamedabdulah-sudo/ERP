/**
 * Contract pure logic (no Prisma, no I/O) — unit-testable without a DB.
 *
 * Status machine:
 *   DRAFT → ACTIVE → SUSPENDED → ACTIVE …
 *   DRAFT → TERMINATED | ACTIVE → TERMINATED | SUSPENDED → TERMINATED
 *   ACTIVE → EXPIRED (system, when endDate passes)
 *   EXPIRED and TERMINATED are terminal.
 */

export type ContractStatusV =
  | "DRAFT"
  | "ACTIVE"
  | "SUSPENDED"
  | "EXPIRED"
  | "TERMINATED";

const TRANSITIONS: Record<ContractStatusV, ContractStatusV[]> = {
  DRAFT: ["ACTIVE", "TERMINATED"],
  ACTIVE: ["SUSPENDED", "EXPIRED", "TERMINATED"],
  SUSPENDED: ["ACTIVE", "TERMINATED"],
  EXPIRED: [],
  TERMINATED: [],
};

export function canTransitionContract(
  from: ContractStatusV,
  to: ContractStatusV,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertContractTransition(
  from: ContractStatusV,
  to: ContractStatusV,
): void {
  if (!canTransitionContract(from, to)) {
    throw new Error(
      `INVALID_TRANSITION: cannot move contract from ${from} to ${to}`,
    );
  }
}

/** Inclusive date-range overlap on calendar days. */
export function periodsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  const s = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return s(aStart) <= s(bEnd) && s(bStart) <= s(aEnd);
}

export interface ContractWindow {
  id: string;
  contractNo: string;
  siteIds: string[];
  startDate: Date;
  endDate: Date;
  status: ContractStatusV;
}

/**
 * Business rule: no two ACTIVE contracts may cover the same site over
 * overlapping periods. Returns the conflicting active contracts
 * (empty = no conflict). `excludeId` skips the contract being updated.
 */
export function findSiteConflicts(
  candidate: { siteIds: string[]; startDate: Date; endDate: Date },
  existing: ContractWindow[],
  excludeId?: string,
): ContractWindow[] {
  return existing.filter((c) => {
    if (excludeId && c.id === excludeId) return false;
    if (c.status !== "ACTIVE") return false;
    const sharedSite = c.siteIds.some((s) => candidate.siteIds.includes(s));
    if (!sharedSite) return false;
    return periodsOverlap(
      candidate.startDate,
      candidate.endDate,
      c.startDate,
      c.endDate,
    );
  });
}
