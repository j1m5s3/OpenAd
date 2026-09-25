import { describe, expect, it } from 'vitest';

import { feeSplit } from './auction';
import { compareEarnings, TAKE_RATE_PRESETS } from './earnings';

describe('compareEarnings', () => {
  it('payout + fee == gross on both sides', () => {
    const r = compareEarnings({
      monthlyImpressions: 1_000_000n,
      ecpmMicros: 5_000_000n,
      networkTakeBps: 3200,
    });
    expect(r.networkPublisherPayout + r.networkFee).toBe(r.grossSpend);
    expect(r.openAdPublisherPayout + r.openAdFee).toBe(r.grossSpend);
  });

  it('exact values for three fixed cases', () => {
    // 1,000,000 impressions at $5 eCPM (5,000,000 micros) = 5,000,000,000 gross base units.
    const a = compareEarnings({
      monthlyImpressions: 1_000_000n,
      ecpmMicros: 5_000_000n,
      networkTakeBps: 3200,
    });
    expect(a.grossSpend).toBe(5_000_000_000n);
    expect(a.networkFee).toBe(1_600_000_000n); // 32% of gross
    expect(a.networkPublisherPayout).toBe(3_400_000_000n);
    expect(a.openAdFee).toBe(125_000_000n); // 2.5% of gross
    expect(a.openAdPublisherPayout).toBe(4_875_000_000n);
    expect(a.monthlyUplift).toBe(1_475_000_000n);
    expect(a.annualUplift).toBe(17_700_000_000n);

    // 500,000 impressions at $2.50 eCPM, a 40% comparison take rate (the middle preset).
    const b = compareEarnings({
      monthlyImpressions: 500_000n,
      ecpmMicros: 2_500_000n,
      networkTakeBps: 4000,
    });
    expect(b.grossSpend).toBe(1_250_000_000n);
    expect(b.networkPublisherPayout).toBe(750_000_000n);
    expect(b.openAdPublisherPayout).toBe(1_218_750_000n);
    expect(b.monthlyUplift).toBe(468_750_000n);

    // 10,000 impressions at $1 eCPM, a 20% comparison take rate (outside the preset range, still
    // a valid input to the pure function).
    const c = compareEarnings({
      monthlyImpressions: 10_000n,
      ecpmMicros: 1_000_000n,
      networkTakeBps: 2000,
    });
    expect(c.grossSpend).toBe(10_000_000n);
    expect(c.networkPublisherPayout).toBe(8_000_000n);
    expect(c.openAdPublisherPayout).toBe(9_750_000n);
    expect(c.monthlyUplift).toBe(1_750_000n);
  });

  it('zero impressions gives 0 everywhere', () => {
    const r = compareEarnings({
      monthlyImpressions: 0n,
      ecpmMicros: 5_000_000n,
      networkTakeBps: 3200,
    });
    expect(r.grossSpend).toBe(0n);
    expect(r.networkPublisherPayout).toBe(0n);
    expect(r.openAdPublisherPayout).toBe(0n);
    expect(r.monthlyUplift).toBe(0n);
    expect(r.annualUplift).toBe(0n);
  });

  it('a network take of 0 bps gives the network the full gross', () => {
    const r = compareEarnings({
      monthlyImpressions: 100_000n,
      ecpmMicros: 1_000_000n,
      networkTakeBps: 0,
    });
    expect(r.networkFee).toBe(0n);
    expect(r.networkPublisherPayout).toBe(r.grossSpend);
  });

  it('floors match feeSplit for the OpenAd side', () => {
    const gross = 5_000_000_000n;
    const r = compareEarnings({
      monthlyImpressions: 1_000_000n,
      ecpmMicros: 5_000_000n,
      networkTakeBps: 3200,
    });
    const expected = feeSplit(gross);
    expect(r.openAdFee).toBe(expected.fee);
    expect(r.openAdPublisherPayout).toBe(expected.publisherAmount);
  });

  it('exposes three presets pinned at 30/40/50% take, each marked approx., inside the one range competitive.md backs', () => {
    expect(TAKE_RATE_PRESETS.map((p) => p.takeBps)).toEqual([3000, 4000, 5000]);
    for (const preset of TAKE_RATE_PRESETS) {
      expect(preset.label).toMatch(/approx\./);
      expect(preset.id).not.toMatch(/crypto|agency/i);
      expect(preset.label).not.toMatch(/crypto|agency/i);
    }
    // The default (index 0) is the conservative, low end, so the headline uplift on /why is the
    // smallest of the three, never the most flattering one.
    expect(TAKE_RATE_PRESETS[0].takeBps).toBe(3000);
  });
});
