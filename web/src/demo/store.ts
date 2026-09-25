/** Demo mode in-memory store (ADR-0016). A module singleton standing in for the real API's
 * database: seeded lazily from `fixtures.ts` on first access, read via `get()` (a deep clone, so
 * callers can never mutate shared state by holding a reference) and written via `update()`. */
import { demoNow } from './clock';
import { type DemoState, seedDemoState } from './fixtures';

let state: DemoState | null = null;
const subscribers = new Set<(state: DemoState) => void>();

function ensureSeeded(): DemoState {
  if (!state) state = seedDemoState(demoNow());
  return state;
}

function notify(): void {
  const snapshot = demoStore.get();
  for (const fn of subscribers) fn(snapshot);
}

export const demoStore = {
  /** Returns a deep clone of the current state; safe for a caller to read or discard freely. */
  get(): DemoState {
    return structuredClone(ensureSeeded());
  },
  /** Applies `fn` to a live (not cloned) reference to the state, persists the result, and notifies
   * subscribers (used by step 7's wallet simulator and later write flows). */
  update(fn: (state: DemoState) => void): void {
    fn(ensureSeeded());
    notify();
  },
  /** Registers a listener called with a fresh clone after every `update()`. Returns an
   * unsubscribe function. */
  subscribe(fn: (state: DemoState) => void): () => void {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },
  /** Re-seeds the store, optionally at a different "now" (defaults to `demoNow()`), and notifies
   * subscribers. Used by tests and by the persona/reset UI a later step adds. */
  reset(now: number = demoNow()): void {
    state = seedDemoState(now);
    notify();
  },
};
