/**
 * Transfer validation (docs/PHASE3.md §4).
 *
 * Transfer records are append-only history; this validates a *request*
 * before it is persisted as PENDING. On approval the service applies
 * sector/site/shift changes in one transaction.
 */

export interface Assignment {
  sectorId: string;
  siteId: string;
  shiftId: string;
}

export type TransferValidation = { ok: true } | { ok: false; reason: string };

/**
 * A transfer must move the employee somewhere: identical
 * sector + site + shift is a no-op and is rejected.
 */
export function validateTransfer(oldAssign: Assignment, newAssign: Assignment): TransferValidation {
  for (const key of ['sectorId', 'siteId', 'shiftId'] as const) {
    if (!oldAssign[key] || !newAssign[key]) {
      return { ok: false, reason: `Missing assignment field: ${key}` };
    }
  }
  const same =
    oldAssign.sectorId === newAssign.sectorId &&
    oldAssign.siteId === newAssign.siteId &&
    oldAssign.shiftId === newAssign.shiftId;
  if (same) {
    return {
      ok: false,
      reason: 'Transfer is a no-op: sector, site and shift are unchanged.',
    };
  }
  return { ok: true };
}
