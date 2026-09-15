/**
 * Cloudflare Worker that fronts GET /v1/serve/:slot and /v1/serve/:slot/media.
 * Not deployed. Origin remains the FastAPI process (ROADMAP 4.4).
 *
 * wrangler secret / vars:
 *   ORIGIN = https://api.example.com
 */
export interface Env {
  ORIGIN: string;
}

const CACHE_TTL = 30;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'GET' || !url.pathname.startsWith('/v1/serve/')) {
      return new Response('not found', { status: 404 });
    }
    const originUrl = new URL(url.pathname + url.search, env.ORIGIN);
    const cache = caches.default;
    const cacheKey = new Request(originUrl.toString(), { method: 'GET' });
    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    const upstream = await fetch(originUrl.toString(), {
      headers: {
        accept: request.headers.get('accept') ?? '*/*',
        origin: request.headers.get('origin') ?? '',
        referer: request.headers.get('referer') ?? '',
      },
    });
    const headers = new Headers(upstream.headers);
    if (!headers.has('Cache-Control')) {
      headers.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
    }
    const response = new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
    if (upstream.ok) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return response;
  },
};

export type ExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};
