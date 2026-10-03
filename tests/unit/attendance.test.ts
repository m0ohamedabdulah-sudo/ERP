import { describe, expect, it } from 'vitest';
import {
  ATTENDANCE_DAY_VALUES,
  countByCode,
  daysInMonth,
  dayValue,
  totalP,
} from '../../src/lib/attendance.js';

describe('attendance day values (spec §32)', () => {
  it.each([
    ['P', 1],
    ['PP', 2],
    ['12', 1.5],
    ['6', 0.5],
    ['A', 0],
    ['X', -2],
    ['AL', 0],
    ['SL', 0],
  ] as const)('code %s has day value %s', (code, expected) => {
    expect(dayValue(code)).toBe(expected);
    expect(ATTENDANCE_DAY_VALUES[code]).toBe(expected);
  });

  it('throws on unknown codes', () => {
    expect(() => dayValue('ZZ')).toThrow('Unknown attendance code: ZZ');
  });

  it('reads values from an injected (configurable) map', () => {
    expect(dayValue('X', { X: -3 })).toBe(-3);
  });
});

describe('totalP', () => {
  it('sums mixed codes', () => {
    // 1 + 1 + 2 + 1.5 + 0.5 + 0 − 2 + 0 + 0 = 4
    expect(totalP(['P', 'P', 'PP', '12', '6', 'A', 'X', 'AL', 'SL'])).toBe(4);
  });

  it('returns 0 for an empty month', () => {
    expect(totalP([])).toBe(0);
  });

  it('propagates unknown-code errors', () => {
    expect(() => totalP(['P', 'ZZ'])).toThrow('Unknown attendance code: ZZ');
  });
});

describe('countByCode', () => {
  it('counts occurrences per code', () => {
    expect(countByCode(['P', 'P', 'A', 'AL', 'P'])).toEqual({ P: 3, A: 1, AL: 1 });
  });
});

describe('daysInMonth (28/29/30/31)', () => {
  it('February 2024 (leap year) has 29 days', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
  });

  it('February 2025 has 28 days', () => {
    expect(daysInMonth(2025, 2)).toBe(28);
  });

  it('April has 30 days', () => {
    expect(daysInMonth(2024, 4)).toBe(30);
  });

  it('January has 31 days', () => {
    expect(daysInMonth(2024, 1)).toBe(31);
  });

  it('rejects invalid months', () => {
    expect(() => daysInMonth(2024, 0)).toThrow();
    expect(() => daysInMonth(2024, 13)).toThrow();
  });
});
