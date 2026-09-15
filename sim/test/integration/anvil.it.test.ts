import { describe, expect, it } from 'vitest';

describe.skipIf(!process.env.OPENAD_SIM_IT)('anvil sim (OPENAD_SIM_IT=1)', () => {
  it('control status is reachable when the daemon is up', async () => {
    const res = await fetch('http://127.0.0.1:8610/status');
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { running: boolean };
    expect(body.running).toBe(true);
  });
});
