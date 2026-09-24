import { afterEach, describe, expect, it, vi } from 'vitest';

import { DemoNetworkError, installNetworkGuard, isAllowedDemoUrl } from './networkGuard';

const ORIGIN = 'http://localhost:3000';

describe('isAllowedDemoUrl', () => {
  it('blocks the real API by origin', () => {
    expect(isAllowedDemoUrl('http://localhost:8000/v1/health', ORIGIN)).toBe(false);
  });

  it('blocks the real API by origin even with a matching VITE_API_URL config', () => {
    expect(
      isAllowedDemoUrl('http://localhost:8000/v1/health', ORIGIN, ['http://localhost:8000']),
    ).toBe(false);
  });

  it('blocks a local chain RPC', () => {
    expect(isAllowedDemoUrl('http://127.0.0.1:8545', ORIGIN)).toBe(false);
  });

  it('blocks a same-origin /v1 path even though the origin matches', () => {
    expect(isAllowedDemoUrl('/v1/health', ORIGIN)).toBe(false);
    expect(isAllowedDemoUrl(`${ORIGIN}/v1/health`, ORIGIN)).toBe(false);
  });

  it('blocks a same-origin /anvil path (the dev RPC proxy)', () => {
    expect(isAllowedDemoUrl('/anvil', ORIGIN)).toBe(false);
    expect(isAllowedDemoUrl('/anvil/eth_chainId', ORIGIN)).toBe(false);
  });

  it('allows same-origin static assets', () => {
    expect(isAllowedDemoUrl('/assets/x.js', ORIGIN)).toBe(true);
    expect(isAllowedDemoUrl(`${ORIGIN}/assets/x.js`, ORIGIN)).toBe(true);
  });

  it('rejects an unparsable URL', () => {
    expect(isAllowedDemoUrl('http://[not-a-valid-host', ORIGIN)).toBe(false);
  });
});

function fakeWindow() {
  return {
    fetch: vi.fn(async () => new Response('ok')),
    XMLHttpRequest: class {
      open(): void {
        // real XHR.open would start a request; the fake just records nothing.
      }
    },
    WebSocket: class {
      url: string;
      constructor(url: string | URL) {
        this.url = url.toString();
      }
    },
    EventSource: class {
      url: string;
      constructor(url: string | URL) {
        this.url = url.toString();
      }
    },
    navigator: { sendBeacon: vi.fn(() => true) },
    location: new URL(ORIGIN),
  } as unknown as typeof window;
}

describe('installNetworkGuard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects (not throws) a fetch to the real API, and logs it', async () => {
    const win = fakeWindow();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    installNetworkGuard(win);

    await expect(win.fetch('http://localhost:8000/v1/health')).rejects.toBeInstanceOf(
      DemoNetworkError,
    );
    expect(errorSpy).toHaveBeenCalled();
  });

  it('lets a same-origin fetch through and restores fetch on undo', async () => {
    const win = fakeWindow();
    const originalFetch = win.fetch;
    const restore = installNetworkGuard(win);

    await win.fetch('/assets/x.js');
    expect(originalFetch).toHaveBeenCalledTimes(1);

    restore();
    expect(win.fetch).toBe(originalFetch);
  });

  it('blocks XMLHttpRequest.open to a local chain RPC', () => {
    const win = fakeWindow();
    installNetworkGuard(win);
    const xhr = new win.XMLHttpRequest();
    expect(() => xhr.open('POST', 'http://127.0.0.1:8545')).toThrow(DemoNetworkError);
  });

  it('blocks new WebSocket() to the real API origin', () => {
    const win = fakeWindow();
    installNetworkGuard(win);
    expect(() => new win.WebSocket('ws://localhost:8000/v1/stream')).toThrow(DemoNetworkError);
  });

  it('blocks new EventSource() to a same-origin /v1 path', () => {
    const win = fakeWindow();
    installNetworkGuard(win);
    expect(() => new win.EventSource('/v1/events')).toThrow(DemoNetworkError);
  });

  it('blocks navigator.sendBeacon() to a local chain RPC', () => {
    const win = fakeWindow();
    installNetworkGuard(win);
    expect(() => win.navigator.sendBeacon('http://127.0.0.1:8545', 'x')).toThrow(
      DemoNetworkError,
    );
  });

  it('undo restores every wrapped surface', () => {
    const win = fakeWindow();
    const original = {
      fetch: win.fetch,
      open: win.XMLHttpRequest.prototype.open,
      WebSocket: win.WebSocket,
      EventSource: win.EventSource,
      sendBeacon: win.navigator.sendBeacon,
    };
    const restore = installNetworkGuard(win);
    restore();
    expect(win.fetch).toBe(original.fetch);
    expect(win.XMLHttpRequest.prototype.open).toBe(original.open);
    expect(win.WebSocket).toBe(original.WebSocket);
    expect(win.EventSource).toBe(original.EventSource);
    expect(win.navigator.sendBeacon).toBe(original.sendBeacon);
  });
});
