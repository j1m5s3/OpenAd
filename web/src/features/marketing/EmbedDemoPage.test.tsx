import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';

import { setRequestHandler } from '../../lib/api';
import { createDemoRequestHandler } from '../../demo/demoApi';
import { demoStore } from '../../demo/store';
import { EmbedDemoPage } from './EmbedDemoPage';

function renderPage() {
  const client = new QueryClient();
  demoStore.reset();
  setRequestHandler(createDemoRequestHandler(demoStore));
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EmbedDemoPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  setRequestHandler();
  cleanup();
});

describe('EmbedDemoPage', () => {
  // The page runs in the test build with VITE_DEMO_MODE unset, i.e. !DEMO_MODE — the same
  // branch a real (non-demo) web build takes. Outside demo mode, origin enforcement (ROADMAP
  // 6.14) means a leased slot only shows its paid creative on the slot's own domain, not here,
  // so the "nothing is leased" copy alone would be misleading (ROADMAP 6.14).
  it("notes that paid creatives need the slot's own domain outside demo mode", async () => {
    renderPage();
    expect(
      screen.getByText(/paid creatives show only on the slot's own domain/i),
    ).toBeInTheDocument();
    // Let the page's own `import('@openad/embed')` settle before the test (and its `cleanup()`)
    // finishes, so the resolved promise never fires its `customElements.define` after teardown.
    await waitFor(() => expect(customElements.get('open-ad')).toBeDefined());
  });
});
