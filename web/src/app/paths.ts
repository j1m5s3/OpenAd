/** Path constants. Kept out of `routes.tsx` so Layout can import them without a cycle. */
export const routes = {
  marketplace: '/',
  publisher: '/publisher',
  advertiser: '/advertiser',
} as const;
