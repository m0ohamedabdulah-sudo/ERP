import { describe, expect, it } from 'vitest';
import { validateTransfer, type Assignment } from '../../src/lib/transfer.js';

const OLD: Assignment = { sectorId: 'sec-1', siteId: 'site-1', shiftId: 'shift-1' };

describe('validateTransfer', () => {
  it('rejects a no-op transfer (sector, site, shift all unchanged)', () => {
    const r = validateTransfer(OLD, { ...OLD });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/no-op/i);
    }
  });

  it('accepts a sector change', () => {
    expect(validateTransfer(OLD, { ...OLD, sectorId: 'sec-2' })).toEqual({ ok: true });
  });

  it('accepts a site change', () => {
    expect(validateTransfer(OLD, { ...OLD, siteId: 'site-2' })).toEqual({ ok: true });
  });

  it('accepts a shift-only change', () => {
    expect(validateTransfer(OLD, { ...OLD, shiftId: 'shift-2' })).toEqual({ ok: true });
  });

  it('rejects missing assignment fields', () => {
    const r = validateTransfer(OLD, { sectorId: '', siteId: 'site-2', shiftId: 'shift-1' });
    expect(r.ok).toBe(false);
  });
});
