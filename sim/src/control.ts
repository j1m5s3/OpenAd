import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { PERSONAS, personaById } from './accounts.js';
import type { EngineState } from './engine.js';
import { enqueueNudge, personaPublic } from './engine.js';
import type { MediaAsset } from './media.js';
import type { ActionName } from './planner/types.js';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(data),
  });
  res.end(data);
}

export function startControlServer(opts: {
  port: number;
  catalog: MediaAsset[];
  state: EngineState;
  extraStatus: () => Promise<Record<string, unknown>>;
}): Server {
  const byName = new Map(opts.catalog.map((a) => [a.name, a]));
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    try {
      if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
        const name = url.pathname.slice('/media/'.length);
        const asset = byName.get(name);
        if (!asset) {
          res.writeHead(404);
          res.end('not found');
          return;
        }
        res.writeHead(200, {
          'content-type': 'image/png',
          'content-length': asset.bytes.length,
          'cache-control': 'public, max-age=3600',
        });
        res.end(Buffer.from(asset.bytes));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/status') {
        const extra = await opts.extraStatus();
        json(res, 200, {
          running: true,
          paused: opts.state.paused,
          ticks: opts.state.ticks,
          last: opts.state.last.slice(-20),
          ...extra,
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/personas') {
        json(res, 200, { personas: PERSONAS.map((p) => personaPublic(p, opts.state)) });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/pause') {
        const body = JSON.parse((await readBody(req)) || '{}') as { paused?: boolean };
        opts.state.paused = body.paused ?? !opts.state.paused;
        json(res, 200, { paused: opts.state.paused });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/nudge') {
        const body = JSON.parse((await readBody(req)) || '{}') as {
          persona?: string;
          action: string;
          params?: Record<string, string>;
        };
        const persona = body.persona ? personaById(body.persona) : PERSONAS[0];
        if (!persona || !body.action) {
          json(res, 400, { error: 'persona and action required' });
          return;
        }
        enqueueNudge(opts.state, {
          personaId: persona.id,
          action: body.action as ActionName,
          params: body.params ?? {},
        });
        json(res, 202, { queued: true, personaId: persona.id, action: body.action });
        return;
      }
      json(res, 404, { error: 'not found' });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });
  server.listen(opts.port, '127.0.0.1');
  return server;
}
