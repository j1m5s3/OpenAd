import { useEffect, useId, useRef, useState } from 'react';

import { FIELD_HINTS, guideUrl, type FieldHintKey } from '../lib/copy';

export function FieldHint({ hintKey }: { hintKey: FieldHintKey }) {
  const hint = FIELD_HINTS[hintKey];
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const panelId = useId();
  const more = hint.guidePath ? guideUrl(hint.guidePath) : undefined;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onPointer(e: MouseEvent) {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  return (
    <span ref={root} className="relative inline-flex">
      <button
        type="button"
        className="rounded-full border border-line px-1.5 text-[10px] leading-4 text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-label="What is this?"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        ?
      </button>
      {open && (
        <span
          id={panelId}
          role="tooltip"
          className="absolute left-0 top-full z-30 mt-1 w-64 rounded-2xl border border-line bg-surface p-3 text-xs font-normal text-ink shadow-xl"
        >
          <span className="block">{hint.tip}</span>
          {more && (
            <a
              href={more}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-accent underline-offset-2 hover:underline"
            >
              Learn more →
            </a>
          )}
        </span>
      )}
    </span>
  );
}

export function GuideLink({
  path,
  children,
  className = 'text-accent underline-offset-2 hover:underline',
}: {
  path: string;
  children: string;
  className?: string;
}) {
  const href = guideUrl(path);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
