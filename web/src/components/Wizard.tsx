import type { ReactNode } from 'react';

export type WizardStepStatus = 'done' | 'active' | 'todo';

export type WizardStep = {
  id: string;
  title: string;
  description: string;
  whatNext: string;
  status: WizardStepStatus;
  content: ReactNode;
};

export function Wizard({
  steps,
  activeId,
  onSelect,
  bare = false,
}: {
  steps: WizardStep[];
  activeId: string;
  onSelect: (id: string) => void;
  bare?: boolean;
}) {
  const index = steps.findIndex((s) => s.id === activeId);
  const active = steps[index] ?? steps[0];
  if (!active) return null;
  const prev = index > 0 ? steps[index - 1] : undefined;
  const next = index >= 0 && index < steps.length - 1 ? steps[index + 1] : undefined;

  return (
    <div className={bare ? 'space-y-4' : 'space-y-4 rounded-2xl border border-line bg-surface p-5'}>
      <ol className="flex flex-wrap gap-2">
        {steps.map((step, i) => {
          const current = step.id === active.id;
          return (
            <li key={step.id}>
              <button
                type="button"
                aria-label={step.title}
                aria-current={current ? 'step' : undefined}
                onClick={() => onSelect(step.id)}
                className={`rounded-full px-3 py-1 text-sm ${
                  current
                    ? 'bg-accent text-accent-ink'
                    : step.status === 'done'
                      ? 'border border-line text-ink'
                      : 'border border-line text-muted'
                }`}
              >
                {i + 1}. {step.title}
              </button>
            </li>
          );
        })}
      </ol>
      <div>
        <h2 className="font-medium">{active.title}</h2>
        <p className="mt-1 text-sm text-muted">{active.description}</p>
      </div>
      {active.content}
      <p className="rounded-xl bg-canvas px-3 py-2 text-sm text-muted">
        What happens next: {active.whatNext}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!prev}
          onClick={() => prev && onSelect(prev.id)}
          className="rounded-full border border-line px-4 py-1.5 text-sm disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="button"
          disabled={!next}
          onClick={() => next && onSelect(next.id)}
          className="rounded-full border border-line px-4 py-1.5 text-sm disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
