/**
 * Attendance day-value business rules.
 *
 * Implements docs/PHASE3.md §1 ("Day-value computation rule"):
 * totalP = Σ AttendanceCode.dayValue over an employee's cells.
 *
 * The map below is the documented default set. In production these
 * values are read from the AttendanceCode table (dayValue /
 * countsAsPresent columns) and passed in as the `values` argument —
 * business rules are configurable data, never hard-coded logic.
 */

export type AttendanceCode = 'P' | 'PP' | '12' | '6' | 'A' | 'X' | 'AL' | 'SL';

export const ATTENDANCE_DAY_VALUES: Record<AttendanceCode, number> = {
  P: 1, // present one shift
  PP: 2, // present two shifts
  '12': 1.5, // one and a half shifts
  '6': 0.5, // half shift
  A: 0, // absence on employee account
  X: -2, // absence counted as two days (configurable deduction)
  AL: 0, // annual leave
  SL: 0, // sick leave
};

/** Day value for a single code; throws on unknown codes (→ 422 at the API layer). */
export function dayValue(
  code: string,
  values: Record<string, number> = ATTENDANCE_DAY_VALUES,
): number {
  const v = values[code];
  if (v === undefined) {
    throw new Error(`Unknown attendance code: ${code}`);
  }
  return v;
}

/** Sum of day values for a month's cells → the "Total P" column. */
export function totalP(
  codes: string[],
  values: Record<string, number> = ATTENDANCE_DAY_VALUES,
): number {
  const sum = codes.reduce((acc, code) => acc + dayValue(code, values), 0);
  return Math.round(sum * 100) / 100;
}

/** Per-code occurrence counts for a month's cells. */
export function countByCode(codes: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const code of codes) {
    counts[code] = (counts[code] ?? 0) + 1;
  }
  return counts;
}

/**
 * Days in a calendar month; the attendance grid adapts to 28/29/30/31.
 * @param month 1–12
 */
export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid year/month: ${year}/${month}`);
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
