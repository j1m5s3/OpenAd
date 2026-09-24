/** Demo persona switcher (ADR-0016). Lets one visitor play both sides of the marketplace in the
 * same in-memory session: it only re-points the demo wallet simulator at another fictional
 * persona's address (`accountsChanged`), so the store — leases, approvals, campaigns — carries
 * over. It never touches a real wallet, key or chain. */
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';

import { DEMO_PERSONAS } from './fixtures';
import type { DemoProvider } from './demoChain';
import { getDemoProvider } from './install';
import { demoStore } from './store';

type PersonaProvider = Pick<DemoProvider, 'getAccount' | 'setAccount'>;

/** The two personas the switcher offers: the default advertiser and the publisher that owns the
 * seeded LEASE slot #0 and CPC slot #1 (and has a pending approval request to act on). */
export const SWITCHER_PERSONAS = [
  {
    ...DEMO_PERSONAS.advertiserWallet,
    option: `Advertiser — ${DEMO_PERSONAS.advertiserWallet.label}`,
  },
  {
    ...DEMO_PERSONAS.publisherNewsletter,
    option: `Publisher — ${DEMO_PERSONAS.publisherNewsletter.label}`,
  },
] as const;

export function PersonaSwitcher({ provider }: { provider?: PersonaProvider }) {
  const wallet = provider ?? getDemoProvider();
  const queryClient = useQueryClient();
  const id = useId();
  const [current, setCurrent] = useState(() => wallet.getAccount().toLowerCase());
  // The demo API's SIWE session (set by `authVerify`), so a visitor can see sign-in happened.
  const [session, setSession] = useState(() => demoStore.get().connectedAddress);
  useEffect(() => {
    const unsubscribe = demoStore.subscribe((s) => setSession(s.connectedAddress));
    return () => {
      unsubscribe();
    };
  }, []);
  const signedIn = session?.toLowerCase() === current;

  function onChange(address: string) {
    wallet.setAccount(address);
    setCurrent(address.toLowerCase());
    void queryClient.invalidateQueries();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <label htmlFor={id}>Viewing as</label>
      <select
        id={id}
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs text-ink"
      >
        {SWITCHER_PERSONAS.map((p) => (
          <option key={p.address} value={p.address.toLowerCase()}>
            {p.option}
          </option>
        ))}
      </select>
      {signedIn && <span className="text-muted">Signed in</span>}
    </span>
  );
}
