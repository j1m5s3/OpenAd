import { afterEach, describe, expect, it, vi } from 'vitest';

import { installDemo } from './install';
import { DemoNetworkError } from './networkGuard';

describe('installDemo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('installs the network guard, so a fetch to the real API rejects', async () => {
    const originalFetch = window.fetch;
    try {
      installDemo();
      await expect(window.fetch('http://localhost:8000/v1/health')).rejects.toBeInstanceOf(
        DemoNetworkError,
      );
    } finally {
      window.fetch = originalFetch;
    }
  });
});
