import { ApiClient } from './api.js';
import { assertLocalChain, loadConfig } from './config.js';
import { createChain, usdcBalance } from './chain.js';
import { loadProtocol } from './deployments.js';
import { createEngineState, jitterDelayMs, tick } from './engine.js';
import { fundPersonas } from './funding.js';
import { buildCatalog } from './media.js';
import { mulberry32 } from './planner/rng.js';
import { PERSONAS } from './accounts.js';
import { startControlServer } from './control.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  assertLocalChain(cfg.chainId);
  const contracts = loadProtocol(cfg.deploymentsDir, cfg.chainId);
  const ctx = createChain(cfg.rpcUrl, contracts);
  const live = await ctx.publicClient.getChainId();
  assertLocalChain(live);

  console.log('sim: funding personas');
  await fundPersonas(ctx, cfg.usdcTarget);

  const catalog = buildCatalog(cfg.seed);
  const mediaBase = `http://127.0.0.1:${cfg.controlPort}`;
  const api = new ApiClient(cfg.apiUrl, fetch, cfg.webOrigin);
  const state = createEngineState();
  const rng = mulberry32(cfg.seed);
  const rt = { ctx, api, catalog, mediaBase, rng };

  const server = startControlServer({
    port: cfg.controlPort,
    catalog,
    state,
    extraStatus: async () => {
      let indexerLag: number | null = null;
      try {
        indexerLag = (await api.health()).indexerLag;
      } catch {
        indexerLag = null;
      }
      const balances: Record<string, string> = {};
      for (const p of PERSONAS) {
        try {
          balances[p.id] = (await usdcBalance(ctx, p.address)).toString();
        } catch {
          balances[p.id] = '?';
        }
      }
      return { indexerLag, balances, mediaBase };
    },
  });

  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  console.log(`sim: control http://127.0.0.1:${cfg.controlPort}/status`);
  console.log('sim: loop starting (Ctrl+C to stop)');

  while (!stopping) {
    try {
      await tick(rt, state, rng);
    } catch (err) {
      console.error('sim: tick failed', err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, jitterDelayMs(cfg.tickSeconds, rng)));
  }
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
