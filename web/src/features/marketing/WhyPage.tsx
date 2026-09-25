/** `/why`: value proposition + earnings calculator (ROADMAP 6.2 step 10+11). Available in every
 * build (demo and normal alike) — pure client-side, no chain and no API. */
import { type ChangeEvent, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { DEMO_MODE } from '../../demo/flag';
import { compareEarnings, TAKE_RATE_PRESETS } from '../../lib/earnings';
import { formatUsdc, parseUsdc } from '../../lib/format';
import { routes } from '../../app/paths';
import { withDevWalletParam } from '../../lib/devWalletQuery';

const DEFAULT_IMPRESSIONS = '1000000';
const DEFAULT_ECPM = '5.00';

function parseImpressions(input: string): bigint {
  const digits = input.trim().replace(/,/g, '');
  if (!/^\d*$/.test(digits) || digits === '') return 0n;
  return BigInt(digits);
}

/** The demo link: `/` in a demo build, `VITE_DEMO_URL` in a normal build when set, otherwise
 * hidden (spec step A.3). */
function demoLinkHref(): string | undefined {
  if (DEMO_MODE) return withDevWalletParam(routes.discover);
  return import.meta.env.VITE_DEMO_URL?.trim() || undefined;
}

export function WhyPage() {
  const [impressionsInput, setImpressionsInput] = useState(DEFAULT_IMPRESSIONS);
  const [ecpmInput, setEcpmInput] = useState(DEFAULT_ECPM);
  const [presetId, setPresetId] = useState<string>(TAKE_RATE_PRESETS[0].id);
  const demoHref = demoLinkHref();

  const preset = TAKE_RATE_PRESETS.find((p) => p.id === presetId) ?? TAKE_RATE_PRESETS[0];
  const monthlyImpressions = parseImpressions(impressionsInput);
  const ecpmMicros = useMemo(() => {
    try {
      return parseUsdc(ecpmInput || '0');
    } catch {
      return 0n;
    }
  }, [ecpmInput]);
  const result = useMemo(
    () => compareEarnings({ monthlyImpressions, ecpmMicros, networkTakeBps: preset.takeBps }),
    [monthlyImpressions, ecpmMicros, preset.takeBps],
  );

  function onEcpmChange(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    // Up to 2 dp, parsed to micros without floats (`parseUsdc` handles the base-unit math).
    if (/^\d*(\.\d{0,2})?$/.test(value)) setEcpmInput(value);
  }

  return (
    <div className="space-y-10">
      <section>
        <p className="text-sm text-accent">Why OpenAd</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Keep about 97.5% of what advertisers pay
        </h1>
        <p className="mt-3 max-w-2xl text-muted">
          OpenAd is a non-custodial advertising marketplace on Base, at the default 2.5% protocol
          fee (on-chain governed, capped at 10%). Publishers sell periods of their slots by Dutch
          auction (LEASE), or open them to pay-per-click campaigns (CPC); advertisers pay in USDC.
          Non-custodial: LEASE pays the publisher inside the buy transaction; CPC budgets sit in an
          on-chain escrow vault the advertiser can close, paid out at batch settlement. No one at
          OpenAd holds keys to your funds. There are no tracking scripts in the embed, and no
          ad-network approval gate — publishers approve creatives directly.
        </p>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="font-semibold">For publishers</h2>
          <div className="mt-3 space-y-3">
            {[
              {
                title: '1. Mint and calendar',
                body: 'Mint a slot NFT and set a calendar of fixed periods. Domain, size, and kind are set once, at mint.',
              },
              {
                title: '2. Set terms',
                body: 'LEASE: choose a Dutch start/floor price. CPC: set a floor CPC and whether creatives need your approval.',
              },
              {
                title: '3. Get paid automatically',
                body: 'LEASE pays you inside the buy transaction. CPC pays out at batch settlement, minus the protocol fee — no invoicing.',
              },
            ].map((step) => (
              <div key={step.title} className="rounded-2xl border border-line bg-surface p-4">
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="font-semibold">For advertisers</h2>
          <div className="mt-3 space-y-3">
            {[
              {
                title: '1. Discover a slot',
                body: 'Browse slots by domain and size. See the live Dutch price or the floor CPC before you commit.',
              },
              {
                title: '2. Register and get approved',
                body: 'Register a creative on-chain, then request the publisher’s approval (or buy directly where it’s waived).',
              },
              {
                title: '3. Buy or fund a campaign',
                body: 'LEASE: buy a period in one transaction. CPC: fund a campaign; the vault escrows your budget until it settles or you close it.',
              },
            ].map((step) => (
              <div key={step.title} className="rounded-2xl border border-line bg-surface p-4">
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-xl font-semibold">Earnings calculator</h2>
        <p className="mt-1 text-sm text-muted">
          Illustrative. Network take rates are approximate public ranges and vary.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="text-sm">
            <span className="block text-muted">Monthly impressions</span>
            <input
              value={impressionsInput}
              onChange={(e) => setImpressionsInput(e.target.value)}
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-ink outline-none"
            />
          </label>
          <label className="text-sm">
            <span className="block text-muted">eCPM (USD)</span>
            <input
              value={ecpmInput}
              onChange={onEcpmChange}
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-ink outline-none"
            />
          </label>
          <label className="text-sm">
            <span className="block text-muted">Compare against</span>
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-ink outline-none"
            >
              {TAKE_RATE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted">
              {preset.label.replace(/\s*\(approx.*\)$/, '')} payout
            </p>
            <p className="mt-1 text-2xl font-semibold">
              {formatUsdc(result.networkPublisherPayout)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted">OpenAd payout</p>
            <p className="mt-1 text-2xl font-semibold text-accent">
              {formatUsdc(result.openAdPublisherPayout)}
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-canvas p-4 text-sm">
          <p>
            Monthly uplift:{' '}
            <span className="font-semibold">{formatUsdc(result.monthlyUplift)}</span> · Annual
            uplift: <span className="font-semibold">{formatUsdc(result.annualUplift)}</span>
          </p>
        </div>
        <p className="mt-4 text-xs text-muted">
          Illustrative. Network take rates are approximate public ranges and vary.
        </p>
      </section>

      <section className="flex flex-wrap gap-3">
        {demoHref &&
          (DEMO_MODE ? (
            <Link
              to={demoHref}
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink"
            >
              Try the demo
            </Link>
          ) : (
            <a
              href={demoHref}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink"
            >
              Try the demo
            </a>
          ))}
        <Link
          to={withDevWalletParam(routes.supply)}
          className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink"
        >
          List a slot
        </Link>
        <Link
          to={withDevWalletParam(routes.discover)}
          className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink"
        >
          Buy a period
        </Link>
        <Link
          to={withDevWalletParam(routes.embedDemo)}
          className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink"
        >
          See the embed live
        </Link>
      </section>
    </div>
  );
}
