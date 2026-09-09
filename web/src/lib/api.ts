// Typed client for the OpenAd read API (/v1). Types mirror api/src/openad/schemas/*.py.
// ROADMAP 3.5 replaces the hand-written types with an OpenAPI-generated client.

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export interface HealthResponse {
  status: string;
  version: string;
  chainId: number;
  env: string;
}

export interface TermsOut {
  startPrice: string; // uint256 as decimal string → use BigInt()
  floorPrice: string;
  leadSeconds: number;
  saleEnd: number;
  approvalMode: number; // 0 REQUIRED, 1 WAIVED
  paused: boolean;
}

export interface SlotOut {
  slotId: string;
  owner: string;
  width: number;
  height: number;
  kind: number; // SlotKind
  domain: string;
  calendarVersion: number;
  periodSeconds: number | null;
  firstPeriodStart: number | null;
  terms: TermsOut | null;
}

export interface SlotListOut {
  items: SlotOut[];
  total: number;
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
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
  return (await res.json()) as T;
}

export const api = {
  health: () => request<HealthResponse>('/v1/health'),
  listSlots: (params: { domain?: string; kind?: number; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.domain) qs.set('domain', params.domain);
    if (params.kind !== undefined) qs.set('kind', String(params.kind));
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.offset !== undefined) qs.set('offset', String(params.offset));
    const suffix = qs.size ? `?${qs.toString()}` : '';
    return request<SlotListOut>(`/v1/slots${suffix}`);
  },
  getSlot: (slotId: bigint | string) => request<SlotOut>(`/v1/slots/${slotId.toString()}`),
};
