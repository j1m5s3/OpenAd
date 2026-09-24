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
  const container = document.getElementById('root');
  if (!container) throw new Error('#root not found');
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
