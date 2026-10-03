import { describe, expect, it } from 'vitest';
import { computeShortage, severityOf } from '../../src/lib/shortage.js';

describe('computeShortage — seed Red Zone fixtures', () => {
  it('Zia Mall: required 25, actual 18 → shortage 7, 28%, CRITICAL', () => {
    const r = computeShortage(25, 18);
    expect(r.shortage).toBe(7);
    expect(r.surplus).toBe(0);
    expect(r.pct).toBe(28);
    expect(severityOf(r.pct)).toBe('CRITICAL');
  });

  it('Bureau 58: required 20, actual 18 → shortage 2, 10%, WARNING', () => {
    const r = computeShortage(20, 18);
    expect(r.shortage).toBe(2);
    expect(r.pct).toBe(10);
    expect(severityOf(r.pct)).toBe('WARNING');
  });

  it('Les Rois: required 30, actual 30 → no shortage, NORMAL', () => {
    const r = computeShortage(30, 30);
    expect(r.shortage).toBe(0);
    expect(r.surplus).toBe(0);
    expect(r.pct).toBe(0);
    expect(severityOf(r.pct)).toBe('NORMAL');
  });

  it('surplus case: required 10, actual 12 → surplus 2, never negative shortage', () => {
    const r = computeShortage(10, 12);
    expect(r.shortage).toBe(0);
    expect(r.surplus).toBe(2);
    expect(r.pct).toBe(0);
    expect(severityOf(r.pct)).toBe('NORMAL');
  });

  it('zero requirement avoids division by zero', () => {
    expect(computeShortage(0, 0).pct).toBe(0);
  });
});

describe('severityOf thresholds', () => {
  it('boundary: exactly 10% is WARNING, just above is CRITICAL', () => {
    expect(severityOf(10)).toBe('WARNING');
    expect(severityOf(10.01)).toBe('CRITICAL');
  });

  it('thresholds are configurable', () => {
    expect(severityOf(5, { warning: 3 })).toBe('CRITICAL');
    expect(severityOf(3, { warning: 3 })).toBe('WARNING');
    expect(severityOf(0, { warning: 3 })).toBe('NORMAL');
  });
});
