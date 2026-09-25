import { describe, expect, it } from 'vitest';

import { DEMO_ABIS } from './abis.generated';

// Every source file that names a contract function (feature write/read call sites + WalletRail).
const sources = import.meta.glob(
  ['../features/**/*.{ts,tsx}', '../components/**/*.{ts,tsx}', '!**/*.test.*'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;

/** Every string literal on a line mentioning `functionName` — catches `functionName: 'quote'`
 * and union types like `functionName: 'set_paused' | 'request_close'`. */
function referencedFunctionNames(): Set<string> {
  const names = new Set<string>();
  for (const source of Object.values(sources)) {
    for (const line of source.split('\n')) {
      if (!line.includes('functionName')) continue;
      for (const match of line.matchAll(/'([A-Za-z][A-Za-z0-9_]*)'/g)) {
        if (match[1]) names.add(match[1]);
      }
    }
  }
  return names;
}

describe('DEMO_ABIS', () => {
  it('contains every function name the web app calls (catches ABI drift without contracts/out)', () => {
    const available = new Set(
      Object.values(DEMO_ABIS).flatMap((abi) =>
        (abi as readonly { type: string; name?: string }[])
          .filter((e) => e.type === 'function')
          .map((e) => e.name),
      ),
    );
    const referenced = referencedFunctionNames();
    expect(referenced.size).toBeGreaterThan(10);
    const missing = [...referenced].filter((name) => !available.has(name));
    expect(missing).toEqual([]);
  });
});
