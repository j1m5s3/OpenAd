import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import { setRequestHandler } from '../../lib/api';
import { createDemoRequestHandler } from '../../demo/demoApi';
import { demoStore } from '../../demo/store';
import { EmbedDemoPage } from './EmbedDemoPage';

// `EmbedDemoPage.test.tsx` covers the real build, where DEMO_MODE is false. `vi.mock` is
// hoisted and applies for this whole file, so the opposite branch — DEMO_MODE true — needs its
// own file: the origin-enforcement copy only applies outside demo mode (ROADMAP 6.14) and must
// stay hidden here.
vi.mock('../../demo/flag', () => ({ DEMO_MODE: true }));

afterEach(() => {
  setRequestHandler();
  cleanup();
});

describe('EmbedDemoPage (demo mode)', () => {
  it('never shows the non-demo origin-enforcement copy', async () => {
    const client = new QueryClient();
    demoStore.reset();
    setRequestHandler(createDemoRequestHandler(demoStore));
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <EmbedDemoPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // Let the page's own `import('@openad/embed')` settle before the test (and its `cleanup()`)
    // finishes, so the resolved promise never fires its `customElements.define` after teardown.
    await waitFor(() => expect(customElements.get('open-ad')).toBeDefined());
    expect(screen.queryByText(/slot's own domain/i)).not.toBeInTheDocument();
  });
});
