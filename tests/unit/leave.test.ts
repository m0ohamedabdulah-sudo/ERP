import { describe, expect, it } from 'vitest';
import { countLeaveDays, overlaps } from '../../src/lib/leave.js';

describe('countLeaveDays (inclusive)', () => {
  it('single day counts as 1', () => {
    expect(countLeaveDays('2024-09-01', '2024-09-01')).toBe(1);
  });

  it('counts a 10-day range', () => {
    expect(countLeaveDays('2024-09-01', '2024-09-10')).toBe(10);
  });

  it('crosses month boundaries', () => {
    // Sep 28, 29, 30 + Oct 1, 2, 3 = 6
    expect(countLeaveDays('2024-09-28', '2024-10-03')).toBe(6);
  });

  it('handles leap day', () => {
    // Feb 28, 29 + Mar 1 = 3
    expect(countLeaveDays('2024-02-28', '2024-03-01')).toBe(3);
  });

  it('rejects end before start', () => {
    expect(() => countLeaveDays('2024-09-10', '2024-09-01')).toThrow(
      'endISO must not be before startISO',
    );
  });

  it('rejects malformed dates', () => {
    expect(() => countLeaveDays('2024-13-01', '2024-13-02')).toThrow('Invalid ISO date');
    expect(() => countLeaveDays('not-a-date', '2024-09-02')).toThrow('Invalid ISO date');
  });
});

describe('overlaps', () => {
  it('detects a genuine overlap', () => {
    expect(
      overlaps({ start: '2024-09-01', end: '2024-09-10' }, { start: '2024-09-05', end: '2024-09-15' }),
    ).toBe(true);
  });

  it('treats touching ranges as overlapping (inclusive bounds)', () => {
    expect(
      overlaps({ start: '2024-09-01', end: '2024-09-10' }, { start: '2024-09-10', end: '2024-09-20' }),
    ).toBe(true);
  });

  it('returns false for disjoint ranges', () => {
    expect(
      overlaps({ start: '2024-09-01', end: '2024-09-10' }, { start: '2024-09-11', end: '2024-09-20' }),
    ).toBe(false);
  });

  it('detects containment', () => {
    expect(
      overlaps({ start: '2024-09-01', end: '2024-09-30' }, { start: '2024-09-10', end: '2024-09-12' }),
    ).toBe(true);
  });
});
