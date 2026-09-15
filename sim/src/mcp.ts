import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { loadConfig } from './config.js';

const DOWN = 'sim not running; start with .\\scripts\\sim-up.cmd';

async function call(path: string, init?: RequestInit): Promise<string> {
  const cfg = loadConfig();
  const url = `http://127.0.0.1:${cfg.controlPort}${path}`;
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    if (!res.ok) return `${DOWN} (${res.status}: ${text.slice(0, 200)})`;
    return text;
  } catch {
    return DOWN;
  }
}

async function main(): Promise<void> {
  const server = new McpServer({ name: 'openad-sim', version: '0.1.0' });

  server.tool('sim_status', 'Status of the OpenAd local sim daemon (ticks, lag, last actions).', {}, async () => ({
    content: [{ type: 'text', text: await call('/status') }],
  }));

  server.tool('sim_list_personas', 'List simulated publishers and advertisers.', {}, async () => ({
    content: [{ type: 'text', text: await call('/personas') }],
  }));

  server.tool(
    'sim_nudge_action',
    'Queue the next sim action (does not skip preconditions).',
    {
      persona: z.string().optional().describe('Persona id, e.g. pub-3 or adv-6'),
      action: z
        .string()
        .describe(
          'register_media | request_approval | buy | buy_with_permit | set_approval | set_terms | mint_slot | set_house_ad | set_paused | open_campaign | top_up_campaign',
        ),
      params: z.record(z.string()).optional(),
    },
    async ({ persona, action, params }) => ({
      content: [
        {
          type: 'text',
          text: await call('/nudge', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ persona, action, params }),
          }),
        },
      ],
    }),
  );

  server.tool(
    'sim_pause_loop',
    'Pause or resume the sim tick loop.',
    { paused: z.boolean().optional() },
    async ({ paused }) => ({
      content: [
        {
          type: 'text',
          text: await call('/pause', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ paused }),
          }),
        },
      ],
    }),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
