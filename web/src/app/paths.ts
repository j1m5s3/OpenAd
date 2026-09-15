export const routes = {
  discover: '/',
  slot: (id: string) => `/slots/${id}`,
  supply: '/supply',
  campaigns: '/campaigns',
} as const;
