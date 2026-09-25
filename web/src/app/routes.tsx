import { createBrowserRouter } from 'react-router';

import { CampaignsPage } from '../features/advertiser/CampaignsPage';
import { EmbedDemoPage } from '../features/marketing/EmbedDemoPage';
import { WhyPage } from '../features/marketing/WhyPage';
import { DiscoverPage } from '../features/marketplace/DiscoverPage';
import { SlotPage } from '../features/marketplace/SlotPage';
import { SupplyPage } from '../features/publisher/SupplyPage';
import { Layout } from './Layout';
import { routes } from './paths';

export { routes } from './paths';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: DiscoverPage },
      { path: 'slots/:slotId', Component: SlotPage },
      { path: routes.supply.replace(/^\//, ''), Component: SupplyPage },
      { path: routes.campaigns.replace(/^\//, ''), Component: CampaignsPage },
      { path: routes.why.replace(/^\//, ''), Component: WhyPage },
      { path: routes.embedDemo.replace(/^\//, ''), Component: EmbedDemoPage },
    ],
  },
]);
