import { describe, expect, it } from 'vitest';

import { formatDuration, formatUsdc, parseUsdc, shortAddress } from './format';

describe('formatUsdc', () => {
  it('formats base units with two-or-more decimals', () => {
    expect(formatUsdc(0n)).toBe('0.00 USDC');
    expect(formatUsdc(1_000_000n)).toBe('1.00 USDC');
    expect(formatUsdc(1_234_560_000n)).toBe('1,234.56 USDC');
    expect(formatUsdc(1_000_001n)).toBe('1.000001 USDC');
    expect(formatUsdc(500_000n, { symbol: false })).toBe('0.50');
  });
});

describe('parseUsdc', () => {
  it('round-trips and rejects too many decimals', () => {
    expect(parseUsdc('12.5')).toBe(12_500_000n);
    expect(parseUsdc('1,000')).toBe(1_000_000_000n);
    expect(parseUsdc('0.000001')).toBe(1n);
    expect(() => parseUsdc('1.2345678')).toThrow();
    expect(() => parseUsdc('abc')).toThrow();
  });
});

describe('helpers', () => {
  it('shortens addresses and formats durations', () => {
    expect(shortAddress('0x' + 'ab'.repeat(20))).toBe('0xabab…abab');
    expect(formatDuration(86_400)).toBe('1d');
    expect(formatDuration(3_600 * 6)).toBe('6h');
    expect(formatDuration(90)).toBe('1m 30s');
    expect(formatDuration(596_835)).toBe('6d 21h');
  });
});
