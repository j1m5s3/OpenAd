import { ConnectButton } from '@rainbow-me/rainbowkit';
import type { ComponentType, FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useSearchParams } from 'react-router';

import { IndexerLagBanner } from '../components/IndexerLagBanner';
import { WalletRail } from '../components/WalletRail';
import { DEMO_MODE } from '../demo/flag';
import { useSiwe } from '../features/auth/useSiwe';
import { guideUrl } from '../lib/copy';
import { withDevWalletParam } from '../lib/devWalletQuery';
import { routes } from './paths';

/** Dynamically imports the demo banner only when `DEMO_MODE` is on, guarded the same way as
 * `main.tsx`'s dev-wallet/demo boot import, so Rollup drops the `demo/` chunk (and any reference
 * to it) from normal builds instead of merely not invoking it at runtime. */
function useDemoBanner(): ComponentType | null {
  const [Banner, setBanner] = useState<ComponentType | null>(null);
  useEffect(() => {
    if (DEMO_MODE) {
      void import('../demo/DemoBanner').then((m) => setBanner(() => m.DemoBanner));
    }
  }, []);
  return Banner;
}

const nav = [
  { to: routes.discover, label: 'Discover', end: true },
  { to: routes.supply, label: 'Supply', end: false },
  { to: routes.campaigns, label: 'Campaigns', end: false },
];

export function Layout() {
  const { error } = useSiwe();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [q, setQ] = useState(params.get('q') ?? '');
  const guideHref = guideUrl();
  const DemoBanner = useDemoBanner();

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const next = q.trim();
    navigate(withDevWalletParam(next ? `/?q=${encodeURIComponent(next)}` : '/'));
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <NavLink
            to={withDevWalletParam(routes.discover)}
            className="text-lg font-semibold tracking-tight"
          >
            OpenAd
          </NavLink>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={withDevWalletParam(item.to)}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-full px-3 py-1.5 text-sm ${
                    isActive ? 'bg-surface text-ink' : 'text-muted hover:text-ink'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            {guideHref && (
              <a
                href={guideHref}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full px-3 py-1.5 text-sm text-muted hover:text-ink"
              >
                Guide
              </a>
            )}
          </nav>
          <form onSubmit={onSearch} className="ml-auto flex-1 md:block md:max-w-xs">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search domain"
              className="w-full rounded-full border border-line bg-surface px-4 py-1.5 text-sm text-ink outline-none placeholder:text-muted"
              aria-label="Search domain"
            />
          </form>
          <div className="ml-auto md:ml-0">
            <ConnectButton chainStatus="icon" showBalance={false} />
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 pb-3 md:hidden">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={withDevWalletParam(item.to)}
              end={item.end}
              className={({ isActive }) =>
                `rounded-full px-3 py-1 text-sm ${isActive ? 'bg-surface' : 'text-muted'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
          {guideHref && (
            <a
              href={guideHref}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full px-3 py-1 text-sm text-muted"
            >
              Guide
            </a>
          )}
        </nav>
      </header>
      {DemoBanner && <DemoBanner />}
      <IndexerLagBanner />
      {error && (
        <p className="border-b border-accent/40 bg-surface px-4 py-2 text-center text-sm text-ink">
          Sign-in: {error}
        </p>
      )}
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 lg:flex-row">
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
        <WalletRail />
      </div>
    </div>
  );
}
