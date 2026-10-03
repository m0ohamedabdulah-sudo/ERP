/**
 * Manpower shortage calculations (docs/PHASE3.md §5, dashboard Red Zone).
 *
 * shortage = required − actual. A negative result is a surplus, never a
 * negative shortage. pct is the shortage as a percentage of required
 * manpower (0 when nothing is required, avoiding division by zero).
 */

export interface ShortageResult {
  required: number;
  actual: number;
  /** Headcount missing; 0 when fully staffed or overstaffed. */
  shortage: number;
  /** Headcount above requirement; 0 when understaffed. */
  surplus: number;
  /** Shortage as % of required, rounded to 2 decimals. */
  pct: number;
}

export function computeShortage(required: number, actual: number): ShortageResult {
  if (required < 0 || actual < 0) {
    throw new Error('required and actual manpower must be non-negative');
  }
  const diff = required - actual;
  const shortage = diff > 0 ? diff : 0;
  const surplus = diff < 0 ? -diff : 0;
  const pct = required > 0 ? Math.round((shortage / required) * 100 * 100) / 100 : 0;
  return { required, actual, shortage, surplus, pct };
}

export type ShortageSeverity = 'NORMAL' | 'WARNING' | 'CRITICAL';

/**
 * Severity thresholds are configurable (Settings); the documented
 * defaults are 0% → NORMAL, 1–10% → WARNING, >10% → CRITICAL.
 */
export interface ShortageThresholds {
  /** pct at or below this is WARNING; above it is CRITICAL. */
  warning: number;
}

export function severityOf(
  pct: number,
  thresholds: ShortageThresholds = { warning: 10 },
): ShortageSeverity {
  if (pct <= 0) return 'NORMAL';
  if (pct <= thresholds.warning) return 'WARNING';
  return 'CRITICAL';
}
