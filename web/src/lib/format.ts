// Formatting helpers. Money enters as bigint USDC base units and leaves as strings here only.

export const USDC_DECIMALS = 6;
const USDC_UNIT = 10n ** BigInt(USDC_DECIMALS);

export function formatUsdc(baseUnits: bigint, opts: { symbol?: boolean } = {}): string {
  const negative = baseUnits < 0n;
  const abs = negative ? -baseUnits : baseUnits;
  const whole = abs / USDC_UNIT;
  const frac = abs % USDC_UNIT;
  const wholeStr = whole.toLocaleString('en-US');
  const fracStr = frac.toString().padStart(USDC_DECIMALS, '0').replace(/0+$/, '');
  const cents = fracStr.length === 0 ? '00' : fracStr.length === 1 ? `${fracStr}0` : fracStr;
  const body = `${negative ? '-' : ''}${wholeStr}.${cents}`;
  return opts.symbol === false ? body : `${body} USDC`;
}

/** Parse a human amount like "12.5" into base units. Throws on invalid input or >6 decimals. */
export function parseUsdc(input: string): bigint {
  const trimmed = input.trim().replace(/,/g, '');
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(trimmed);
  if (!match) throw new Error(`invalid USDC amount: ${input}`);
  const whole = match[1] ?? '0';
  const frac = (match[2] ?? '').padEnd(USDC_DECIMALS, '0');
  return BigInt(whole) * USDC_UNIT + BigInt(frac);
}

export function shortAddress(address: string, chars = 4): string {
  if (address.length <= 2 + chars * 2) return address;
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

export function formatUnixSeconds(ts: number, locale = 'en-US'): string {
  return new Date(ts * 1000).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDuration(seconds: number): string {
  if (seconds % 86_400 === 0) return `${seconds / 86_400}d`;
  if (seconds % 3_600 === 0) return `${seconds / 3_600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}
