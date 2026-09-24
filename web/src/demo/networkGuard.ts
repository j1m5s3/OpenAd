/** Demo mode network guard (ADR-0016).
 *
 * Demo mode must never reach the real API or a real chain RPC. Since fixtures and the in-memory
 * EIP-1193 simulator answer every read and write in-page, the only way a leak could happen is a
 * stray network call from code that forgot to check `DEMO_MODE`. This module wraps every
 * browser network surface (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
 * `navigator.sendBeacon`) so that mistake fails loudly instead of silently reaching the network.
 */

export class DemoNetworkError extends Error {
  constructor(url: string) {
    super(`Demo mode: blocked network request to "${url}" — demo builds must not reach a real API or chain.`);
    this.name = 'DemoNetworkError';
  }
}

/** Same-origin request paths that are still denied even though they resolve to the page's own
 * origin: the real API mounts under `/v1`, and the dev Vite proxy forwards `/anvil` to Anvil. A
 * demo build talking to either, same-origin or not, is a leak. */
const DENIED_SAME_ORIGIN_PATH_PREFIXES = ['/v1/', '/v1', '/anvil'];

/** Origins denied outright, in addition to same-origin path prefixes: the configured real API
 * base (`VITE_API_URL`), if it can be parsed. Kept as a function (not a module-level constant)
 * so it re-reads `import.meta.env` per call, which keeps it test-friendly. */
function configuredDeniedOrigins(): string[] {
  const origins: string[] = [];
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) {
    try {
      origins.push(new URL(apiUrl).origin);
    } catch {
      // unparsable VITE_API_URL: nothing to add.
    }
  }
  return origins;
}

/** True only for a same-origin static asset that is not one of the denied API/RPC paths, and
 * not a request to a separately configured API/RPC origin. Everything else — a different
 * origin, a local proxy path, or the real API's own origin — is denied. */
export function isAllowedDemoUrl(
  url: string,
  origin: string = window.location.origin,
  deniedOrigins: readonly string[] = configuredDeniedOrigins(),
): boolean {
  let resolved: URL;
  try {
    resolved = new URL(url, origin);
  } catch {
    return false;
  }
  if (resolved.origin !== origin) return false;
  if (deniedOrigins.includes(resolved.origin)) return false;
  if (DENIED_SAME_ORIGIN_PATH_PREFIXES.some((prefix) => resolved.pathname.startsWith(prefix))) {
    return false;
  }
  return true;
}

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function assertAllowed(url: string, win: typeof window): void {
  if (!isAllowedDemoUrl(url, win.location.origin)) {
    console.error(new DemoNetworkError(url));
    throw new DemoNetworkError(url);
  }
}

function guardFetch(win: typeof window): () => void {
  const original = win.fetch;
  win.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = resolveRequestUrl(input);
    if (!isAllowedDemoUrl(url, win.location.origin)) {
      const error = new DemoNetworkError(url);
      console.error(error);
      // fetch() itself never throws synchronously for a bad URL; reject its promise so callers
      // that already handle a failed fetch see this the same way.
      return Promise.reject(error);
    }
    return original.call(win, input, init);
  }) as typeof win.fetch;
  return () => {
    win.fetch = original;
  };
}

function guardXhrOpen(win: typeof window): () => void {
  const proto = win.XMLHttpRequest.prototype;
  const original = proto.open;
  proto.open = function open(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    assertAllowed(url.toString(), win);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matching XHR.open's own overloaded signature.
    return (original as any).call(this, method, url, ...rest);
  };
  return () => {
    proto.open = original;
  };
}

function guardWebSocket(win: typeof window): () => void {
  const OriginalWebSocket = win.WebSocket;
  class GuardedWebSocket extends OriginalWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      assertAllowed(url.toString(), win);
      super(url, protocols);
    }
  }
  win.WebSocket = GuardedWebSocket as unknown as typeof WebSocket;
  return () => {
    win.WebSocket = OriginalWebSocket;
  };
}

function guardEventSource(win: typeof window): () => void {
  // Not every test environment implements EventSource (jsdom does not); nothing to guard there.
  if (typeof win.EventSource !== 'function') return () => {};
  const OriginalEventSource = win.EventSource;
  class GuardedEventSource extends OriginalEventSource {
    constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
      assertAllowed(url.toString(), win);
      super(url, eventSourceInitDict);
    }
  }
  win.EventSource = GuardedEventSource as unknown as typeof EventSource;
  return () => {
    win.EventSource = OriginalEventSource;
  };
}

function guardSendBeacon(win: typeof window): () => void {
  // Not every test environment implements sendBeacon (jsdom does not); nothing to guard there.
  if (typeof win.navigator?.sendBeacon !== 'function') return () => {};
  const original = win.navigator.sendBeacon;
  win.navigator.sendBeacon = ((url: string | URL, data?: BodyInit | null) => {
    assertAllowed(url.toString(), win);
    return original.call(win.navigator, url, data);
  }) as typeof win.navigator.sendBeacon;
  return () => {
    win.navigator.sendBeacon = original;
  };
}

/** Wraps every network surface (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
 * `navigator.sendBeacon`) so a request to a non-allowed URL is blocked and logged instead of
 * reaching the network. Returns a single restore function that undoes all of them (used by
 * tests). */
export function installNetworkGuard(win: typeof window = window): () => void {
  const restoreFns = [
    guardFetch(win),
    guardXhrOpen(win),
    guardWebSocket(win),
    guardEventSource(win),
    guardSendBeacon(win),
  ];
  return () => {
    for (const restore of restoreFns) restore();
  };
}
