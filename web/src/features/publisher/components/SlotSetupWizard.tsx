import { useState, type FormEvent } from 'react';

import { Field, FieldLabel } from '../../../components/Field';
import { Wizard } from '../../../components/Wizard';
import { WIZARD_COPY } from '../../../lib/copy';
import { formatDuration } from '../../../lib/format';
import {
  APPROVAL_MODE_LABEL,
  KIND_LABEL,
  SALE_CPC,
  SALE_LEASE,
  SALE_MODE_LABEL,
  unixToDatetimeLocal,
} from '../../../lib/labels';

const copy = WIZARD_COPY.slotSetup;

export function SlotSetupWizard({
  pending,
  defaultSlotId,
  onMint,
  onCalendar,
  onTerms,
}: {
  pending: boolean;
  defaultSlotId: string;
  onMint: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onCalendar: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onTerms: (e: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const [activeId, setActiveId] = useState('mint');
  const [saleMode, setSaleMode] = useState(String(SALE_LEASE));
  const cpc = Number(saleMode) === SALE_CPC;
  const termsWhatNext = cpc ? copy.termsCpcWhatNext : copy.terms.whatNext;
  const ids = ['mint', 'calendar', 'terms'] as const;
  const statusOf = (id: string) => {
    const a = ids.indexOf(activeId as (typeof ids)[number]);
    const i = ids.indexOf(id as (typeof ids)[number]);
    if (i < a) return 'done' as const;
    if (i === a) return 'active' as const;
    return 'todo' as const;
  };

  return (
    <Wizard
      activeId={activeId}
      onSelect={setActiveId}
      steps={[
        {
          id: 'mint',
          title: copy.mint.title,
          description: copy.mint.description,
          whatNext: copy.mint.whatNext,
          status: statusOf('mint'),
          content: (
            <form onSubmit={(e) => void onMint(e)} className="space-y-3">
              <h2 className="font-medium">{copy.mint.title}</h2>
              <Field name="domain" label="Domain" placeholder="example.com" hintKey="domain" />
              <Field name="width" label="Width (px)" defaultValue="300" hintKey="width" />
              <Field name="height" label="Height (px)" defaultValue="250" hintKey="height" />
              <FieldLabel label="Kind" hintKey="kind">
                <select
                  name="kind"
                  defaultValue="0"
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
                >
                  {Object.entries(KIND_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <Submit pending={pending} />
            </form>
          ),
        },
        {
          id: 'calendar',
          title: copy.calendar.title,
          description: copy.calendar.description,
          whatNext: copy.calendar.whatNext,
          status: statusOf('calendar'),
          content: (
            <form onSubmit={(e) => void onCalendar(e)} className="space-y-3">
              <h2 className="font-medium">{copy.calendar.title}</h2>
              <Field
                key={`cal-${defaultSlotId}`}
                name="slotId"
                label="Slot id"
                defaultValue={defaultSlotId}
                hintKey="slotId"
              />
              <Field
                name="periodSeconds"
                label="Period length (seconds)"
                defaultValue="86400"
                hintKey="periodSeconds"
              />
              <p className="text-xs text-muted">86400 = 1 day. {formatDuration(86400)} is typical.</p>
              <Field
                name="firstStart"
                label="First period start"
                type="datetime-local"
                defaultValue={unixToDatetimeLocal(Math.floor(Date.now() / 1000) + 3600)}
                hintKey="firstStart"
              />
              <Submit pending={pending} />
            </form>
          ),
        },
        {
          id: 'terms',
          title: copy.terms.title,
          description: copy.terms.description,
          whatNext: termsWhatNext,
          status: statusOf('terms'),
          content: (
            <form onSubmit={(e) => void onTerms(e)} className="space-y-3">
              <h2 className="font-medium">{copy.terms.title}</h2>
              <Field
                key={`terms-${defaultSlotId}`}
                name="slotId"
                label="Slot id"
                defaultValue={defaultSlotId}
                hintKey="slotId"
              />
              <FieldLabel label="Sale mode" hintKey="saleMode">
                <select
                  name="saleMode"
                  value={saleMode}
                  onChange={(e) => setSaleMode(e.target.value)}
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
                >
                  {Object.entries(SALE_MODE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              {!cpc && (
                <>
                  <Field name="startPrice" label="Start USDC" defaultValue="10" hintKey="startPrice" />
                  <Field name="floorPrice" label="Floor USDC" defaultValue="1" hintKey="floorPrice" />
                  <Field
                    name="leadSeconds"
                    label="Lead time (seconds)"
                    defaultValue="3600"
                    hintKey="leadSeconds"
                  />
                  <p className="text-xs text-muted">
                    Auction opens this long before the period. 3600 = {formatDuration(3600)}.
                  </p>
                </>
              )}
              <Field
                name="floorCpc"
                label="Floor CPC (USDC)"
                defaultValue="0.1"
                hintKey="floorCpc"
              />
              <p className="text-xs text-muted">
                {cpc
                  ? 'Advertisers cannot go below this CPC. Matching is at serve — this is not a period buy.'
                  : 'Used only when sale mode is CPC. Ignored for Lease (Dutch).'}
              </p>
              <FieldLabel label="Approval mode" hintKey="approvalMode">
                <select
                  name="approvalMode"
                  defaultValue="0"
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
                >
                  {Object.entries(APPROVAL_MODE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <Submit pending={pending} />
            </form>
          ),
        },
      ]}
    />
  );
}

function Submit({ pending }: { pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink disabled:opacity-40"
    >
      Submit
    </button>
  );
}
