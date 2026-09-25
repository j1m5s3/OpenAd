/** Guided-tour persistence + restart event (ROADMAP 6.2 step 10+11, demo only). Read and written
 * inside try/catch, per ADR-0016: the tour renders correctly (it just starts inactive) when
 * `localStorage` throws or is unavailable.
 *
 * The tour is inactive by default — a fresh demo visit never pops an overlay over the page (it
 * would otherwise sit on top of the "Connect Wallet" button on first load). It starts only when
 * the DemoBanner's "Take the tour" control calls `restartTour()`, and stays inactive afterwards
 * until that is pressed again. */

const STORAGE_ACTIVE = 'openad-demo-tour-active';
const STORAGE_STEP = 'openad-demo-tour-step';

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Unavailable (private window, blocked storage, non-browser test env): nothing to persist.
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // See safeSet.
  }
}

/** Whether the tour overlay should be showing. Defaults to inactive. */
export function isTourActive(): boolean {
  return safeGet(STORAGE_ACTIVE) === '1';
}

export function setTourActive(active: boolean): void {
  if (active) safeSet(STORAGE_ACTIVE, '1');
  else safeRemove(STORAGE_ACTIVE);
}

export function getStoredStepIndex(): number {
  const raw = safeGet(STORAGE_STEP);
  const n = raw === null ? 0 : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
}

export function setStoredStepIndex(index: number): void {
  safeSet(STORAGE_STEP, String(index));
}

type Listener = () => void;
const restartListeners = new Set<Listener>();

/** Activates the tour from step 0 and notifies any mounted `Tour` (the `DemoBanner`'s "Restart
 * tour" button calls this — it is also how the tour is started the first time, since a fresh
 * demo visit never shows it unasked). */
export function restartTour(): void {
  setTourActive(true);
  setStoredStepIndex(0);
  for (const fn of restartListeners) fn();
}

export function subscribeTourRestart(fn: Listener): () => void {
  restartListeners.add(fn);
  return () => restartListeners.delete(fn);
}
