import { useId, type ReactNode } from 'react';

import type { FieldHintKey } from '../lib/copy';
import { FieldHint } from './FieldHint';

export function FieldLabel({
  label,
  hintKey,
  htmlFor,
  children,
}: {
  label: string;
  hintKey?: FieldHintKey;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="block text-sm text-muted">
      <div className="mb-1 flex items-center gap-1">
        {htmlFor ? (
          <label htmlFor={htmlFor}>{label}</label>
        ) : (
          <span>{label}</span>
        )}
        {hintKey ? <FieldHint hintKey={hintKey} /> : null}
      </div>
      {children}
    </div>
  );
}

export function Field({
  name,
  label,
  defaultValue,
  placeholder,
  type = 'text',
  hintKey,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  hintKey?: FieldHintKey;
}) {
  const id = useId();
  return (
    <FieldLabel label={label} htmlFor={id} {...(hintKey ? { hintKey } : {})}>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
      />
    </FieldLabel>
  );
}
