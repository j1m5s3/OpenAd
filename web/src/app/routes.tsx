import { createBrowserRouter } from 'react-router';

import { AdvertiserPage } from '../features/advertiser/AdvertiserPage';
import { MarketplacePage } from '../features/marketplace/MarketplacePage';
import { PublisherPage } from '../features/publisher/PublisherPage';
import { Layout } from './Layout';

export const routes = {
  marketplace: '/',
  publisher: '/publisher',
  advertiser: '/advertiser',
} as const;

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: MarketplacePage },
      { path: routes.publisher, Component: PublisherPage },
      { path: routes.advertiser, Component: AdvertiserPage },
    ],
  },
]);
