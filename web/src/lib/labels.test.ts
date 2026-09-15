import { describe, expect, it } from 'vitest';

import {
  approvalModeLabel,
  approvalStatusLabel,
  datetimeLocalToUnix,
  kindLabel,
  saleModeLabel,
  unixToDatetimeLocal,
} from './labels';

describe('labels', () => {
  it('names kind and approval mode with glossary-facing words', () => {
    expect(kindLabel(0)).toBe('Display');
    expect(kindLabel(99)).toBe('Kind 99');
    expect(approvalModeLabel(0)).toBe('Required');
    expect(approvalModeLabel(1)).toBe('Waived');
    expect(approvalStatusLabel(1)).toBe('Requested');
    expect(approvalStatusLabel(2)).toBe('Approved');
    expect(saleModeLabel(0)).toBe('Lease (Dutch)');
    expect(saleModeLabel(1)).toBe('CPC');
  });

  it('round-trips datetime-local through unix seconds', () => {
    const unix = 1_700_000_000;
    const local = unixToDatetimeLocal(unix);
    expect(datetimeLocalToUnix(local)).toBe(Math.floor(Date.parse(local) / 1000));
    expect(() => datetimeLocalToUnix('nope')).toThrow(/invalid datetime/);
  });
});
