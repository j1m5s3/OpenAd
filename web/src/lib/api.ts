// Typed client for /v1. Schema types come from OpenAPI (ROADMAP 3.5).
import type { components } from '../generated/openapi';

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export type HealthResponse = components['schemas']['HealthResponse'];
export type SlotOut = components['schemas']['SlotOut'];
export type SlotListOut = components['schemas']['SlotListOut'];
export type SlotListingOut = components['schemas']['SlotListingOut'];
export type PeriodOut = components['schemas']['PeriodOut'];
export type PeriodListOut = components['schemas']['PeriodListOut'];
export type CreativeOut = components['schemas']['CreativeOut'];
export type PublisherOut = components['schemas']['PublisherOut'];
export type AdvertiserOut = components['schemas']['AdvertiserOut'];
export type ApprovalOut = components['schemas']['ApprovalOut'];
export type SlotAnalyticsOut = components['schemas']['SlotAnalyticsOut'];
export type AdvertiserAnalyticsOut = components['schemas']['AdvertiserAnalyticsOut'];
export type AnalyticsTotals = components['schemas']['AnalyticsTotals'];
export type DailyBucket = components['schemas']['DailyBucket'];
export type BySlotOut = components['schemas']['BySlotOut'];

export interface AnalyticsWindowParams {
  from?: number;
  to?: number;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type RequestHandler = (path: string, init?: RequestInit) => Promise<unknown>;

async function defaultRequestHandler(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { accept: 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let code = 'http_error';
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      code = body.error ?? code;
      message = body.message ?? message;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, code, message);
  }
  if (res.status === 204) return undefined;
  return (await res.json()) as unknown;
}

let requestHandler: RequestHandler = defaultRequestHandler;

/** Swaps the resolver `request()` delegates to. Demo mode (ADR-0016) installs a fixture-backed
 * handler here instead of hitting the network; behaviour is unchanged when never called. */
export function setRequestHandler(handler: RequestHandler = defaultRequestHandler): void {
  requestHandler = handler;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await requestHandler(path, init)) as T;
}

export const api = {
  health: () => request<HealthResponse>('/v1/health'),
  listSlots: (
    params: {
      domain?: string;
      kind?: number;
      category?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) => {
    const qs = new URLSearchParams();
    if (params.domain) qs.set('domain', params.domain);
    if (params.kind !== undefined) qs.set('kind', String(params.kind));
    if (params.category) qs.set('category', params.category);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.offset !== undefined) qs.set('offset', String(params.offset));
    const suffix = qs.size ? `?${qs.toString()}` : '';
    return request<SlotListOut>(`/v1/slots${suffix}`);
  },
  getSlot: (slotId: bigint | string) => request<SlotOut>(`/v1/slots/${slotId.toString()}`),
  listPeriods: (slotId: bigint | string, from = 0, to = 14) =>
    request<PeriodListOut>(`/v1/slots/${slotId.toString()}/periods?from=${from}&to=${to}`),
  getCreative: (id: bigint | string) => request<CreativeOut>(`/v1/creatives/${id.toString()}`),
  publisher: (address: string) => request<PublisherOut>(`/v1/publishers/${address}`),
  publisherApprovals: (address: string) =>
    request<ApprovalOut[]>(`/v1/publishers/${address}/approvals`),
  advertiser: (address: string) => request<AdvertiserOut>(`/v1/advertisers/${address}`),
  pricingSuggestion: (address: string, slotId: bigint | string) =>
    request<Record<string, string>>(
      `/v1/publishers/${address}/pricing-suggestion?slot_id=${slotId.toString()}`,
    ),
  authNonce: () => request<{ nonce: string }>('/v1/auth/nonce', { method: 'POST' }),
  authVerify: (message: string, signature: string) =>
    request<{ address: string }>('/v1/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, signature }),
    }),
  authLogout: () => request<{ ok: boolean }>('/v1/auth/logout', { method: 'POST' }),
  putHouseAd: (slotId: bigint | string, body: { mediaUrl: string; clickUrl: string }) =>
    request<Record<string, string>>(`/v1/slots/${slotId.toString()}/house-ad`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  putSlotListing: (
    slotId: bigint | string,
    body: { summary: string; audience: string; categories: string[] },
  ) =>
    request<SlotListingOut>(`/v1/slots/${slotId.toString()}/listing`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteSlotListing: (slotId: bigint | string) =>
    request<void>(`/v1/slots/${slotId.toString()}/listing`, { method: 'DELETE' }),
  startDomainVerification: (slotId: bigint | string, method: 'meta_tag' | 'dns_txt' = 'meta_tag') =>
    request<Record<string, string | boolean | null>>(
      `/v1/slots/${slotId.toString()}/domain-verification?method=${method}`,
      { method: 'POST' },
    ),
  slotAnalytics: (slotId: bigint | string, window: AnalyticsWindowParams = {}) => {
    const qs = new URLSearchParams();
    if (window.from !== undefined) qs.set('from', String(window.from));
    if (window.to !== undefined) qs.set('to', String(window.to));
    const suffix = qs.size ? `?${qs.toString()}` : '';
    return request<SlotAnalyticsOut>(`/v1/analytics/slots/${slotId.toString()}${suffix}`);
  },
  advertiserAnalytics: (address: string, window: AnalyticsWindowParams = {}) => {
    const qs = new URLSearchParams();
    if (window.from !== undefined) qs.set('from', String(window.from));
    if (window.to !== undefined) qs.set('to', String(window.to));
    const suffix = qs.size ? `?${qs.toString()}` : '';
    return request<AdvertiserAnalyticsOut>(`/v1/analytics/advertisers/${address}${suffix}`);
  },
};
