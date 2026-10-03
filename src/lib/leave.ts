/**
 * Leave date-range helpers (docs/PHASE3.md §3).
 *
 * All parsing is done in UTC so day counts are stable regardless of the
 * server's local timezone. Dates are ISO calendar dates (YYYY-MM-DD).
 */

export interface DateRange {
  start: string;
  end: string;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function toUtcMidnight(iso: string): number {
  const m = ISO_DATE.exec(iso);
  if (!m) {
    throw new Error(`Invalid ISO date: ${iso}`);
  }
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const check = new Date(t);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new Error(`Invalid ISO date: ${iso}`);
  }
  return t;
}

/** Inclusive day count between two dates (same start/end → 1). */
export function countLeaveDays(startISO: string, endISO: string): number {
  const start = toUtcMidnight(startISO);
  const end = toUtcMidnight(endISO);
  if (end < start) {
    throw new Error('endISO must not be before startISO');
  }
  return Math.round((end - start) / DAY_MS) + 1;
}

/**
 * True when two inclusive date ranges share at least one day.
 * Used to reject overlapping approved leaves (PHASE3.md §3 → 422).
 */
export function overlaps(a: DateRange, b: DateRange): boolean {
  toUtcMidnight(a.start);
  toUtcMidnight(a.end);
  toUtcMidnight(b.start);
  toUtcMidnight(b.end);
  return a.start <= b.end && b.start <= a.end;
}
