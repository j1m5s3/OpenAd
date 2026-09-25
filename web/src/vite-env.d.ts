/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_TURNKEY_ORGANIZATION_ID?: string;
  readonly VITE_TURNKEY_AUTH_PROXY_CONFIG_ID?: string;
  readonly VITE_GUIDE_URL?: string;
  readonly VITE_DEMO_MODE?: string;
  readonly VITE_DEMO_URL?: string;
  /** `'hash'` picks `createHashRouter` (static hosting with no server-side SPA fallback); any
   * other value (including unset) keeps `createBrowserRouter` (ADR-0016 hosting amendment). */
  readonly VITE_ROUTER?: string;
  /** Overrides the versioned embed script URL `lib/embedSnippet.ts` puts in publisher snippets.
   * Unset falls back to `new URL('embed/open-ad.v1.js', document.baseURI)`, the file the web
   * build's `embedScriptCopy` Vite plugin ships alongside the app (ROADMAP 6.3). Set this only
   * when the embed script is hosted elsewhere, e.g. a CDN. */
  readonly VITE_EMBED_SCRIPT_URL?: string;
}
