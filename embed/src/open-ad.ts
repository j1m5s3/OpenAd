// <open-ad slot-id="42" api="https://api.example" house-src="…" house-href="…">
//
// Constraints (docs/ARCHITECTURE.md §6, .cursor/rules/embed.mdc): zero dependencies, only
// talks to {api}/v1/serve/{slot}, renders <a><img></a> in a shadow root, no storage/cookies,
// refreshes after `ttl` only while visible, ≤ 5 KB gzipped.
import type { OpenAdRenderDetail, ServeCreative, ServeResponse } from './types';

const DEFAULT_API = 'http://localhost:8000';
const MIN_TTL = 5;
const MAX_TTL = 3600;
const REL = 'noopener noreferrer nofollow sponsored';

export class OpenAdElement extends HTMLElement {
  static readonly tagName = 'open-ad';
  static get observedAttributes(): string[] {
    return ['slot-id', 'api', 'house-src', 'house-href', 'width', 'height'];
  }

  private readonly root: ShadowRoot;
  private readonly link: HTMLAnchorElement;
  private readonly img: HTMLImageElement;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private observer: IntersectionObserver | undefined;
  private visible = false;
  private controller: AbortController | undefined;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent =
      ':host{display:inline-block;line-height:0;overflow:hidden}a{display:block}img{display:block;width:100%;height:100%;object-fit:contain}';
    this.link = document.createElement('a');
    this.link.target = '_blank';
    this.link.rel = REL;
    this.img = document.createElement('img');
    this.img.decoding = 'async';
    this.img.loading = 'lazy';
    this.img.referrerPolicy = 'no-referrer';
    this.link.append(this.img);
    this.root.append(style, this.link);
  }

  // ------------------------------------------------------------------ attributes

  get slotId(): string {
    return this.getAttribute('slot-id') ?? '';
  }
  get api(): string {
    return (this.getAttribute('api') ?? DEFAULT_API).replace(/\/+$/, '');
  }

  // ------------------------------------------------------------------ lifecycle

  connectedCallback(): void {
    this.applySize();
    if (typeof IntersectionObserver === 'undefined') {
      this.visible = true;
      void this.load();
      return;
    }
    this.observer = new IntersectionObserver((entries) => {
      const wasVisible = this.visible;
      this.visible = entries.some((e) => e.isIntersecting);
      if (this.visible && !wasVisible) void this.load();
      if (!this.visible) this.clearTimer();
    });
    this.observer.observe(this);
  }

  disconnectedCallback(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.controller?.abort();
    this.clearTimer();
  }

  attributeChangedCallback(name: string): void {
    if (!this.isConnected) return;
    if (name === 'width' || name === 'height') this.applySize();
    else if (name === 'slot-id' || name === 'api') void this.load();
    else this.renderHouse(); // house-* changed; only matters if we are showing it
  }

  // ------------------------------------------------------------------ loading

  async load(): Promise<void> {
    this.clearTimer();
    this.controller?.abort();
    const slot = this.slotId;
    if (!slot) return this.fail();
    const controller = new AbortController();
    this.controller = controller;
    try {
      const res = await fetch(`${this.api}/v1/serve/${encodeURIComponent(slot)}`, {
        credentials: 'omit',
        mode: 'cors',
        signal: controller.signal,
      });
      if (res.status !== 200 && res.status !== 404) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ServeResponse;
      if (data.creative && (data.status === 'lease' || data.status === 'campaign' || data.status === 'house')) {
        this.renderCreative(data.creative);
        this.emit(data.status);
      } else {
        this.renderHouse();
        this.emit(data.status);
      }
      this.schedule(data.ttl);
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      this.fail();
      this.schedule(60);
    }
  }

  private fail(): void {
    this.renderHouse();
    this.emit('error');
    this.dispatchEvent(new CustomEvent('openad:error', { bubbles: true, composed: true }));
  }

  private schedule(ttl: number): void {
    if (!this.visible) return;
    const seconds = Math.min(MAX_TTL, Math.max(MIN_TTL, Number(ttl) || MIN_TTL));
    this.timer = setTimeout(() => void this.load(), seconds * 1000);
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  // ------------------------------------------------------------------ rendering

  private renderCreative(c: ServeCreative): void {
    this.img.src = c.mediaUrl;
    this.img.alt = c.alt ?? '';
    this.img.width = c.width;
    this.img.height = c.height;
    this.setHref(c.clickUrl);
  }

  private renderHouse(): void {
    const src = this.getAttribute('house-src');
    if (src) {
      this.img.src = src;
      this.img.alt = '';
      this.setHref(this.getAttribute('house-href') ?? '');
      this.link.hidden = false;
    } else {
      this.img.removeAttribute('src');
      this.link.hidden = true;
    }
  }

  private setHref(href: string): void {
    if (href && /^https?:\/\//i.test(href)) this.link.href = href;
    else this.link.removeAttribute('href');
    this.link.hidden = false;
  }

  private applySize(): void {
    const w = this.getAttribute('width');
    const h = this.getAttribute('height');
    if (w) this.style.width = `${Number(w)}px`;
    if (h) this.style.height = `${Number(h)}px`;
  }

  private emit(status: OpenAdRenderDetail['status']): void {
    const detail: OpenAdRenderDetail = { slotId: this.slotId, status };
    this.dispatchEvent(new CustomEvent('openad:render', { detail, bubbles: true, composed: true }));
  }
}
