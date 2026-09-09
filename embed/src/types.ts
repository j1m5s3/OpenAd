// Serve response contract. MUST match api/src/openad/schemas/serve.py field for field.
// docs/ARCHITECTURE.md §3.4

export type ServeStatus = 'lease' | 'house' | 'empty' | 'unknown';

export interface ServeCreative {
  kind: 'image';
  mediaUrl: string;
  clickUrl: string;
  width: number;
  height: number;
  alt: string;
}

export interface ServeLease {
  advertiser: string;
  expiresAt: string; // ISO-8601 UTC
}

export interface ServeResponse {
  slotId: string;
  status: ServeStatus;
  creative: ServeCreative | null;
  lease: ServeLease | null;
  ttl: number;
}

export interface OpenAdRenderDetail {
  slotId: string;
  status: ServeStatus | 'error';
}
