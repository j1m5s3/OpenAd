import { afterEach, describe, expect, it } from 'vitest';

import { api, setRequestHandler } from '../lib/api';
import { installDemo } from './install';
import { DemoNetworkError } from './networkGuard';

// installNetworkGuard patches every browser network surface it wraps (fetch, XMLHttpRequest.open,
// WebSocket, EventSource, sendBeacon); snapshot all of them so a leftover patch from one test
// never leaks into the next.
const originalFetch = window.fetch;
const originalXhrOpen = window.XMLHttpRequest.prototype.open;
const originalWebSocket = window.WebSocket;
const originalEventSource = window.EventSource;
const originalSendBeacon = window.navigator.sendBeacon;

afterEach(() => {
  window.fetch = originalFetch;
  window.XMLHttpRequest.prototype.open = originalXhrOpen;
  window.WebSocket = originalWebSocket;
  window.EventSource = originalEventSource;
  window.navigator.sendBeacon = originalSendBeacon;
  setRequestHandler(); // restore the default (real-fetch) request handler
});

describe('installDemo', () => {
  it('installs the network guard, so a fetch to the real API rejects', async () => {
    installDemo();
    await expect(window.fetch('http://localhost:8000/v1/health')).rejects.toBeInstanceOf(
      DemoNetworkError,
    );
  });

  it('installs the fixture-backed request handler, so api.listSlots() resolves from fixtures', async () => {
    installDemo();
    const result = await api.listSlots();
    expect(result.items.length).toBeGreaterThan(0);
  });
});
