// JSX typing for the `<open-ad>` custom element (embed/src/open-ad.ts), used only from
// `features/marketing/EmbedDemoPage.tsx` (ROADMAP 6.2 step 10+11). The element's own attribute
// contract is documented there; this just lets `tsc` accept it as JSX.
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

// React 19's automatic JSX runtime resolves `JSX.IntrinsicElements` from `React.JSX` (the
// namespace nested inside the ambient `React` namespace in `@types/react`), not the bare global
// `JSX` namespace — so the augmentation has to merge into `React.JSX`, inside `declare global`
// because this file is a module (it has an `import`/`export`).
declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        'open-ad': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
          'slot-id'?: string;
          api?: string;
          width?: string | number;
          height?: string | number;
          'house-src'?: string;
          'house-href'?: string;
        };
      }
    }
  }
}

export {};
