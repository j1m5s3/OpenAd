/** Fixture-backed request handler for `web/src/lib/api.ts` (ADR-0016). Every `api.*` method
 * resolves from `demoStore` — no `fetch`, no chain read, no signature check — so the demo build
 * satisfies D3 while every page still calls the exact same typed client the real app uses.
 *
 * Routing mirrors `api/src/openad/routers/*.py` closely enough to reuse its response shapes and
 * error semantics, without depending on the API package (that would pull the API into the web
 * bundle, which `networkGuard` and the leak test forbid regardless).
 */
import type { ApprovalOut, CreativeOut, HealthResponse, RequestHandler } from '../lib/api';
import { ApiError } from '../lib/api';
import { demoNow } from './clock';
import { computePeriod, buildAdvertiserOut, buildPublisherOut, suggestPrices } from './fixtures';
import type { DemoState } from './fixtures';
import type { demoStore } from './store';

type Store = Pick<typeof demoStore, 'get' | 'update'>;

/** Small artificial latency so loading states render — 0 under Vitest (`import.meta.env.MODE`
 * is `"test"` there), otherwise a short, fixed delay well under any UI timeout. */
function demoDelay(): Promise<void> {
  const ms = import.meta.env.MODE === 'test' ? 0 : 120;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A known route whose resource does not exist in the fixtures (e.g. a slot id nobody seeded). */
function notFound(kind: string, id: string): never {
  throw new ApiError(404, 'not_found', `${kind} ${id} not found`);
}

/** A path that matches no route at all — never something the real API would 404 on with this
 * code, but distinct so a stray typo in a caller fails loudly instead of looking like a real
 * "resource missing" 404. */
function routeNotFound(path: string): never {
  throw new ApiError(404, 'demo_not_found', `no demo route for "${path}"`);
}

function findSlot(state: DemoState, slotId: string) {
  return state.slots.find((s) => s.slot.slotId === slotId);
}

/** `path.split('/')` segments are `string | undefined` under `noUncheckedIndexedAccess`; every
 * route below has already matched on `rest.length`, so the segment always exists — this just
 * gives TypeScript that same guarantee without a cast. */
function segment(rest: string[], index: number, path: string): string {
  const value = rest[index];
  if (value === undefined) routeNotFound(path);
  return value;
}

/** A random-looking but deterministic hex string derived from `seed`; used for demo nonces and
 * domain-verification tokens. Never a real secret — demo mode performs no signature check. */
function pseudoHex(seed: string, length: number): string {
  let acc = 0;
  for (let i = 0; i < seed.length; i += 1) acc = (acc * 31 + seed.charCodeAt(i)) >>> 0;
  let hex = '';
  while (hex.length < length) {
    acc = (acc * 1103515245 + 12345) >>> 0;
    hex += acc.toString(16).padStart(8, '0');
  }
  return hex.slice(0, length);
}

/** Pulls a `0x…40-hex` address out of a SIWE message body, if present. Lets a later persona
 * switcher (ROADMAP 6.2 step 7+) put the chosen persona's address in the signed message and have
 * `authVerify` "recognize" it — with no real signature check, documented here: this is demo-only
 * (ADR-0016 D3); nothing here ever runs outside a `VITE_DEMO_MODE=1` build. */
function extractAddress(message: string): string | null {
  const match = /0x[0-9a-fA-F]{40}/.exec(message);
  return match ? match[0] : null;
}

/** Mirrors `auth_service.get_session` + `require_slot_owner` (the real `/v1` off-chain publisher
 * routes): 401 without a SIWE session, 404 for an unknown slot, 403 when the signed-in wallet does
 * not own the slot. The "session" is `DemoState.connectedAddress`, set by `authVerify`. */
function requireSlotOwner(state: DemoState, slotId: string): void {
  const session = state.connectedAddress;
  if (!session) throw new ApiError(401, 'unauthorized', 'sign in first');
  const fixture = findSlot(state, slotId);
  if (!fixture) notFound('slot', slotId);
  if (fixture.slot.owner.toLowerCase() !== session.toLowerCase()) {
    throw new ApiError(403, 'forbidden', 'wallet is not the slot owner');
  }
}

function json(body: unknown): unknown {
  // Round-trip through JSON so callers get plain data (matching what `fetch().json()` would
  // hand back), never a live reference into the store.
  return JSON.parse(JSON.stringify(body));
}

/** Builds the handler `setRequestHandler` installs in demo mode. `store` is `demoStore` in
 * production and an injectable fake in tests. */
export function createDemoRequestHandler(store: Store): RequestHandler {
  return async (path, init) => {
    await demoDelay();
    const method = (init?.method ?? 'GET').toUpperCase();
    const url = new URL(path, 'http://demo.invalid');
    const segments = url.pathname.split('/').filter(Boolean); // ['v1', ...]
    const now = demoNow();

    if (segments[0] !== 'v1') routeNotFound(path);
    const rest = segments.slice(1);

    // GET /v1/health
    if (method === 'GET' && rest.length === 1 && rest[0] === 'health') {
      return json({
        status: 'ok',
        version: 'demo',
        chainId: 31337,
        env: 'demo',
        indexerLag: 0,
      } satisfies HealthResponse);
    }

    // GET /v1/slots, GET /v1/slots/{id}, GET /v1/slots/{id}/periods
    if (rest[0] === 'slots') {
      if (method === 'GET' && rest.length === 1) {
        const state = store.get();
        const domain = url.searchParams.get('domain');
        const kindParam = url.searchParams.get('kind');
        const kind = kindParam === null ? null : Number(kindParam);
        const limit = Number(url.searchParams.get('limit') ?? '50');
        const offset = Number(url.searchParams.get('offset') ?? '0');
        let items = state.slots.map((s) => s.slot);
        if (domain) items = items.filter((s) => s.domain === domain);
        if (kind !== null) items = items.filter((s) => s.kind === kind);
        const total = items.length;
        items = items.slice(offset, offset + limit);
        return json({ items, total });
      }
      if (method === 'GET' && rest.length === 2) {
        const slotId = segment(rest, 1, path);
        const state = store.get();
        const fixture = findSlot(state, slotId);
        if (!fixture) notFound('slot', slotId);
        return json(fixture.slot);
      }
      if (method === 'GET' && rest.length === 3 && rest[2] === 'periods') {
        const slotId = segment(rest, 1, path);
        const state = store.get();
        const fixture = findSlot(state, slotId);
        if (!fixture) notFound('slot', slotId);
        const from = Number(url.searchParams.get('from') ?? '0');
        const to = Math.max(from, Number(url.searchParams.get('to') ?? '7'));
        if (fixture.slot.calendarVersion === 0) return json({ items: [] });
        const items = [];
        for (let idx = from; idx <= to; idx += 1) {
          items.push(computePeriod(fixture.slot, fixture.leases, idx, now));
        }
        return json({ items });
      }
      if (method === 'PUT' && rest.length === 3 && rest[2] === 'house-ad') {
        const slotId = segment(rest, 1, path);
        requireSlotOwner(store.get(), slotId);
        const body = init?.body ? (JSON.parse(String(init.body)) as { mediaUrl: string; clickUrl: string }) : null;
        if (!body) throw new ApiError(422, 'validation_error', 'missing house-ad body');
        const houseAd = {
          slotId,
          mediaUrl: body.mediaUrl,
          clickUrl: body.clickUrl,
        } satisfies Record<string, string>;
        store.update((s) => {
          s.houseAds[slotId] = houseAd;
        });
        return json(houseAd);
      }
      if (method === 'POST' && rest.length === 3 && rest[2] === 'domain-verification') {
        const slotId = segment(rest, 1, path);
        requireSlotOwner(store.get(), slotId);
        const requestedMethod = url.searchParams.get('method') ?? 'meta_tag';
        const token = pseudoHex(`domain:${slotId}`, 32);
        // Starting verification never verifies (the real API checks the meta tag / TXT record
        // only on `?check=true`, which the demo cannot reach — there is no real domain).
        const record = { slotId, method: requestedMethod, token, verifiedAt: null };
        store.update((s) => {
          s.domainVerifications[slotId] = record;
        });
        return json({
          slotId: record.slotId,
          method: record.method,
          token: record.token,
          verified: record.verifiedAt !== null,
        } satisfies Record<string, string | boolean | null>);
      }
    }

    // GET /v1/creatives/{id}
    if (method === 'GET' && rest[0] === 'creatives' && rest.length === 2) {
      const creativeId = segment(rest, 1, path);
      const state = store.get();
      const creative: CreativeOut | undefined = state.creatives[creativeId];
      if (!creative) notFound('creative', creativeId);
      return json(creative);
    }

    // /v1/publishers/{address}[...]
    if (rest[0] === 'publishers' && rest.length >= 2) {
      const address = segment(rest, 1, path);
      const state = store.get();
      if (method === 'GET' && rest.length === 2) {
        return json(buildPublisherOut(state, address));
      }
      if (method === 'GET' && rest.length === 3 && rest[2] === 'approvals') {
        const approvals: ApprovalOut[] = state.approvals.filter(
          (a) => a.publisher.toLowerCase() === address.toLowerCase(),
        );
        return json(approvals);
      }
      if (method === 'GET' && rest.length === 3 && rest[2] === 'pricing-suggestion') {
        const slotId = url.searchParams.get('slot_id');
        if (!slotId) throw new ApiError(422, 'validation_error', 'missing slot_id');
        requireSlotOwner(state, slotId);
        if (state.connectedAddress?.toLowerCase() !== address.toLowerCase()) {
          throw new ApiError(403, 'forbidden', 'wallet is not the publisher');
        }
        return json(suggestPrices(state, slotId, now));
      }
    }

    // GET /v1/advertisers/{address}
    if (method === 'GET' && rest[0] === 'advertisers' && rest.length === 2) {
      const address = segment(rest, 1, path);
      const state = store.get();
      return json(buildAdvertiserOut(state, address));
    }

    // /v1/auth/*
    if (rest[0] === 'auth') {
      if (method === 'POST' && rest[1] === 'nonce') {
        return json({ nonce: `demo-${pseudoHex('nonce', 16)}` });
      }
      if (method === 'POST' && rest[1] === 'verify') {
        const body = init?.body ? (JSON.parse(String(init.body)) as { message: string }) : { message: '' };
        // Demo only (ADR-0016 D3): no signature is checked, and none is possible without a real
        // wallet. The "connected" address is whichever demo persona's address appears in the
        // signed message, so a later persona switcher can drive this without changing this file.
        // Lowercase, like `auth_service.verify_siwe`: `useSiwe` compares the returned session
        // address to `address.toLowerCase()`, and a checksummed one would re-sign forever.
        const address = extractAddress(body.message)?.toLowerCase();
        if (!address) throw new ApiError(401, 'unauthorized', 'no demo persona address in message');
        store.update((s) => {
          s.connectedAddress = address;
        });
        return json({ address });
      }
      if (method === 'POST' && rest[1] === 'logout') {
        store.update((s) => {
          s.connectedAddress = null;
        });
        return json({ ok: true });
      }
    }

    routeNotFound(path);
  };
}
