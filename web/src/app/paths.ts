export const routes = {
  discover: '/',
  slot: (id: string) => `/slots/${id}`,
  supply: '/supply',
  campaigns: '/campaigns',
  why: '/why',
  embedDemo: '/embed-demo',
} as const;
