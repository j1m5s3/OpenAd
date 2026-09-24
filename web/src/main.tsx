import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@rainbow-me/rainbowkit/styles.css';
import './styles/index.css';

import { DEMO_MODE } from './demo/flag';

async function boot(): Promise<void> {
  if (DEMO_MODE) {
    const { installDemo } = await import('./demo/install');
    installDemo();
  } else if (import.meta.env.DEV) {
    const { installDevWallet } = await import('./dev/anvilWallet');
    installDevWallet();
  }
  // Load wagmi/RainbowKit only after the injector exists so `injectedWallet` sees it.
  const { App } = await import('./app/App');
  const { queryClient } = await import('./app/queryClient');
  let config;
  if (DEMO_MODE) {
    const { createDemoWagmiConfig, syncDemoQueries } = await import('./demo/wagmiDemo');
    syncDemoQueries(queryClient);
    config = createDemoWagmiConfig();
  } else {
    const { createRealConfig } = await import('./lib/wagmi');
    config = createRealConfig();
  }
  const container = document.getElementById('root');
  if (!container) throw new Error('#root not found');
  createRoot(container).render(
    <StrictMode>
      <App config={config} />
    </StrictMode>,
  );
}

void boot();
