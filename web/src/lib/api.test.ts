import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, setRequestHandler } from './api';

describe('setRequestHandler', () => {
  afterEach(() => {
    setRequestHandler();
    vi.unstubAllGlobals();
  });

  it('uses the default fetch path when no handler is installed', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ status: 'ok', indexerLag: 0 }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const health = await api.health();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(health).toEqual({ status: 'ok', indexerLag: 0 });
  });

  it('routes requests through a custom handler and never calls fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const handler = vi.fn(async (path: string) => {
      expect(path).toBe('/v1/health');
      return { status: 'demo', indexerLag: 0 };
    });

    setRequestHandler(handler);
    const health = await api.health();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(health).toEqual({ status: 'demo', indexerLag: 0 });
  });
});
