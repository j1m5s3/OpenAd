/** Guided tour overlay (ROADMAP 6.2 step 10+11, demo only). Walks a visitor through both
 * personas across 6 steps (`steps.ts`), switching persona through the demo wallet's
 * `setAccount` — never a real wallet — and navigating with the app's own router so the in-memory
 * store carries over (a full reload would reset it, by design; see `e2e/demo/flows.spec.ts`). */
import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router';

import { getDemoProvider } from '../install';
import { TOUR_FINISH_ROUTE, TOUR_STEPS, type TourTarget } from './steps';
import {
  getStoredStepIndex,
  isTourActive,
  setStoredStepIndex,
  setTourActive,
  subscribeTourRestart,
} from './tourState';

const CARD_WIDTH = 320;
const CARD_MARGIN = 16;
const POLL_MS = 150;
const POLL_ATTEMPTS = 12; // ~1.8s: enough for a react-query fetch to resolve on a fresh route.

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function resolveTarget(target: TourTarget | null): HTMLElement | null {
  if (!target) return null;
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(target.selector));
  if (!target.text) return candidates[0] ?? null;
  const needle = target.text.toLowerCase();
  return candidates.find((el) => (el.textContent ?? '').toLowerCase().includes(needle)) ?? null;
}

function clampLeft(left: number): number {
  const maxLeft = window.innerWidth - CARD_WIDTH - CARD_MARGIN;
  return Math.max(CARD_MARGIN, Math.min(left, Math.max(CARD_MARGIN, maxLeft)));
}

export function Tour() {
  const [active, setActive] = useState(isTourActive);
  const [stepIndex, setStepIndex] = useState(getStoredStepIndex);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const step = TOUR_STEPS[stepIndex];

  // A (re)start from the DemoBanner shows the tour from step 0, wherever this instance is
  // mounted (Layout keeps exactly one). A fresh demo visit never activates on its own.
  useEffect(
    () =>
      subscribeTourRestart(() => {
        setActive(true);
        setStepIndex(0);
      }),
    [],
  );

  // Keep the route and persona in sync with the current step. Runs whenever the step (or a
  // restart) changes; not on every unrelated navigation, so a visitor can freely browse without
  // the tour yanking them back.
  useEffect(() => {
    if (!active || !step) return;
    if (location.pathname !== step.route) navigate(step.route);
    if (step.persona) getDemoProvider().setAccount(step.persona);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the step should re-trigger this.
  }, [active, stepIndex]);

  // Locate (and lightly highlight) the current step's target, polling briefly for data that
  // loads asynchronously (react-query) after the route change lands.
  useLayoutEffect(() => {
    if (!active || !step) return;
    let cancelled = false;
    let attempts = 0;
    let highlighted: HTMLElement | null = null;
    const tick = () => {
      if (cancelled) return;
      const el = resolveTarget(step.target);
      if (el) {
        const box = el.getBoundingClientRect();
        setRect({
          top: box.top + window.scrollY,
          left: box.left + window.scrollX,
          width: box.width,
          height: box.height,
        });
        el.style.outline = '2px solid var(--color-accent, #c8f542)';
        el.style.outlineOffset = '2px';
        highlighted = el;
        return;
      }
      setRect(null);
      attempts += 1;
      if (attempts < POLL_ATTEMPTS) setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      cancelled = true;
      if (highlighted) {
        highlighted.style.outline = '';
        highlighted.style.outlineOffset = '';
      }
    };
    // `step` is derived from `stepIndex` against the constant `TOUR_STEPS`, so re-running on
    // `stepIndex` already covers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex, location.pathname]);

  useEffect(() => {
    if (active) cardRef.current?.focus();
  }, [active, stepIndex]);

  function finish() {
    setTourActive(false);
    setActive(false);
    navigate(TOUR_FINISH_ROUTE);
  }

  function next() {
    if (stepIndex >= TOUR_STEPS.length - 1) {
      finish();
      return;
    }
    const nextIndex = stepIndex + 1;
    setStepIndex(nextIndex);
    setStoredStepIndex(nextIndex);
  }

  function back() {
    const prevIndex = Math.max(0, stepIndex - 1);
    setStepIndex(prevIndex);
    setStoredStepIndex(prevIndex);
  }

  function skip() {
    setTourActive(false);
    setActive(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') skip();
  }

  if (!active || !step) return null;

  const wrapperStyle: CSSProperties = rect
    ? { position: 'absolute', top: 0, left: 0, width: 0, height: 0 }
    : {
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      };

  const cardStyle: CSSProperties | undefined = rect
    ? {
        position: 'absolute',
        top: rect.top + rect.height + 10,
        left: clampLeft(rect.left),
        width: CARD_WIDTH,
        zIndex: 50,
      }
    : undefined;

  return (
    <div style={wrapperStyle} className={rect ? '' : 'bg-canvas/40'}>
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="openad-tour-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={cardStyle}
        className="w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-4 shadow-lg outline-none"
      >
        <p className="text-xs text-muted">
          Tour {stepIndex + 1} of {TOUR_STEPS.length}
        </p>
        <h2 id="openad-tour-title" className="mt-1 font-semibold">
          {step.title}
        </h2>
        <p className="mt-1 text-sm text-muted">{step.body}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" onClick={skip} className="text-xs text-muted underline">
            Skip
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={back}
              disabled={stepIndex === 0}
              className="rounded-full border border-line px-3 py-1 text-sm text-ink disabled:opacity-40"
            >
              Back
            </button>
            <button
              type="button"
              onClick={next}
              className="rounded-full bg-accent px-3 py-1 text-sm text-accent-ink"
            >
              {stepIndex === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
