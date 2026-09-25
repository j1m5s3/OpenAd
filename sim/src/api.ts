import type { Address, Hex } from 'viem';

import { SIM_CHAIN_ID } from './accounts.js';
import { DEFAULT_WEB_ORIGIN, buildSiweMessage, siweLooksValid, siweOrigin } from './siwe.js';

export type SlotJson = {
  slotId: string;
  owner: string;
  width: number;
  height: number;
  kind: number;
  domain: string;
  calendarVersion: number;
  periodSeconds: number | null;
  firstPeriodStart: number | null;
  terms: {
    startPrice: string;
    floorPrice: string;
    leadSeconds: number;
    saleEnd: number;
    approvalMode: number;
    saleMode: number;
    floorCpc: string;
    paused: boolean;
  } | null;
};

export type PeriodJson = {
  periodIndex: string;
  start: number;
  end: number;
  leased: boolean;
  lessee: string | null;
  creativeId: string | null;
  sellable: boolean;
  reason: string;
  indicativePrice: string;
};

export type CreativeJson = {
  creativeId: string;
  advertiser: string;
  width: number;
  height: number;
  verificationStatus: string;
};

export type AdvertiserJson = {
  address: string;
  creativeIds: string[];
  leaseCount: number;
  campaigns?: CampaignJson[];
};

export type CampaignJson = {
  campaignId: string;
  advertiser: string;
  slotId: string;
  creativeId: string;
  maxCpc: string;
  remaining: string;
  budget: string;
  paused: boolean;
  closed: boolean;
  closeAfter: number;
  serves: number;
};

export type ApprovalJson = {
  publisher: string;
  creativeId: string;
  status: number;
  advertiser: string | null;
};

export type HealthJson = {
  status: string;
  indexerLag: number | null;
};

type FetchFn = typeof fetch;

export class ApiClient {
  readonly cookies = new Map<string, string>();

  constructor(
    readonly baseUrl: string,
    private readonly fetchImpl: FetchFn = fetch,
    /** Origin the personas sign in as (the web app's, never `baseUrl`): see `SimConfig.webOrigin`. */
    readonly webOrigin: string = DEFAULT_WEB_ORIGIN,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}, cookieKey?: string): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    if (cookieKey) {
      const c = this.cookies.get(cookieKey.toLowerCase());
      if (c) headers.set('cookie', `openad_session=${c}`);
    }
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });
    if (res.status === 401 && cookieKey) {
      this.cookies.delete(cookieKey.toLowerCase());
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${path} ${res.status}: ${text.slice(0, 240)}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  health(): Promise<HealthJson> {
    return this.request('/v1/health');
  }

  async listSlots(): Promise<SlotJson[]> {
    const body = await this.request<{ items: SlotJson[] }>('/v1/slots?limit=200');
    return body.items;
  }

  listPeriods(slotId: string, from = 0, to = 7): Promise<{ items: PeriodJson[] }> {
    return this.request(`/v1/slots/${slotId}/periods?from=${from}&to=${to}`);
  }

  getCreative(id: string): Promise<CreativeJson> {
    return this.request(`/v1/creatives/${id}`);
  }

  advertiser(address: string): Promise<AdvertiserJson> {
    return this.request(`/v1/advertisers/${address}`);
  }

  publisherApprovals(address: string): Promise<ApprovalJson[]> {
    return this.request(`/v1/publishers/${address}/approvals`);
  }

  async siwe(account: { address: Address; signMessage: (args: { message: string }) => Promise<Hex> }): Promise<void> {
    const key = account.address.toLowerCase();
    const nonceBody = await this.request<{ nonce: string }>('/v1/auth/nonce', { method: 'POST' });
    const message = buildSiweMessage({
      ...siweOrigin(this.webOrigin),
      address: account.address,
      chainId: SIM_CHAIN_ID,
      nonce: nonceBody.nonce,
    });
    if (!siweLooksValid(message, SIM_CHAIN_ID, this.webOrigin)) {
      throw new Error('sim built a SIWE message the API would reject');
    }
    const signature = await account.signMessage({ message });
    const res = await this.fetchImpl(`${this.baseUrl}/v1/auth/verify`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ message, signature }),
    });
    if (!res.ok) {
      throw new Error(`SIWE verify ${res.status}: ${(await res.text()).slice(0, 240)}`);
    }
    const setCookies =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : [res.headers.get('set-cookie') ?? ''];
    const joined = setCookies.join('; ');
    const match = /openad_session=([^;]+)/.exec(joined);
    if (!match?.[1]) {
      throw new Error('SIWE verify did not set openad_session');
    }
    this.cookies.set(key, match[1]);
  }

  async putHouseAd(
    slotId: string,
    body: { mediaUrl: string; clickUrl: string },
    address: Address,
  ): Promise<void> {
    await this.request(
      `/v1/slots/${slotId}/house-ad`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      address,
    );
  }

  async verifyCreative(creativeId: string, address: Address): Promise<CreativeJson> {
    return this.request(
      `/v1/creatives/${creativeId}/verify`,
      { method: 'POST' },
      address,
    );
  }
}
