import { describe, expect, it } from 'vitest';
import { buildShiftShortageRow } from '../../modules/shortage/shortage.service.js';

const base = {
  siteId: 'site-1',
  siteName: 'Zia Mall',
  shiftId: 'shift-1',
  shiftName: 'Morning',
  requiredSource: 'manpower' as const,
  rostered: 20,
  absent: 2,
  onLeave: 1,
};

describe('shortage engine row builder', () => {
  it('required 25, present 18 → shortage 7, 28%, CRITICAL', () => {
    const row = buildShiftShortageRow({ ...base, required: 25, present: 18 });
    expect(row.shortage).toBe(7);
    expect(row.surplus).toBe(0);
    expect(row.pct).toBe(28);
    expect(row.severity).toBe('CRITICAL');
  });

  it('required 20, present 18 → shortage 2, 10%, WARNING', () => {
    const row = buildShiftShortageRow({ ...base, required: 20, present: 18 });
    expect(row.shortage).toBe(2);
    expect(row.pct).toBe(10);
    expect(row.severity).toBe('WARNING');
  });

  it('fully staffed → NORMAL, no shortage', () => {
    const row = buildShiftShortageRow({ ...base, required: 14, present: 14 });
    expect(row.shortage).toBe(0);
    expect(row.severity).toBe('NORMAL');
  });

  it('overstaffed → surplus, never negative shortage', () => {
    const row = buildShiftShortageRow({ ...base, required: 10, present: 12 });
    expect(row.shortage).toBe(0);
    expect(row.surplus).toBe(2);
    expect(row.severity).toBe('NORMAL');
  });

  it('absent and on-leave counts pass through untouched', () => {
    const row = buildShiftShortageRow({
      ...base,
      required: 10,
      present: 7,
      absent: 2,
      onLeave: 1,
    });
    expect(row.absent).toBe(2);
    expect(row.onLeave).toBe(1);
    expect(row.shortage).toBe(3);
  });

  it('required 0 → pct 0, no division by zero', () => {
    const row = buildShiftShortageRow({ ...base, required: 0, present: 0 });
    expect(row.pct).toBe(0);
    expect(row.severity).toBe('NORMAL');
  });
});
