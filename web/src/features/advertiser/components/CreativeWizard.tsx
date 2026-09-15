import { useState, type FormEvent } from 'react';

import { Field, FieldLabel } from '../../../components/Field';
import { Wizard } from '../../../components/Wizard';
import { WIZARD_COPY } from '../../../lib/copy';
import { targetChainId } from '../../../lib/wagmi';

const copy = WIZARD_COPY.creativeSetup;

export function CreativeWizard({
  pending,
  hash,
  creativeIds,
  onFile,
  onRegisterMedia,
  onRegisterNft,
  onRequestApproval,
}: {
  pending: boolean;
  hash: string;
  creativeIds: string[];
  onFile: (file: File) => Promise<void>;
  onRegisterMedia: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onRegisterNft: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onRequestApproval: (e: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const [activeId, setActiveId] = useState('register');
  const [kind, setKind] = useState<'media' | 'nft'>('media');
  const register = kind === 'media' ? copy.registerMedia : copy.registerNft;
  const ids = ['register', 'approval'] as const;
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
          id: 'register',
          title: register.title,
          description: register.description,
          whatNext: register.whatNext,
          status: statusOf('register'),
          content: (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`rounded-full px-3 py-1 text-sm ${
                    kind === 'media' ? 'bg-accent text-accent-ink' : 'border border-line text-muted'
                  }`}
                  onClick={() => setKind('media')}
                >
                  Register media
                </button>
                <button
                  type="button"
                  className={`rounded-full px-3 py-1 text-sm ${
                    kind === 'nft' ? 'bg-accent text-accent-ink' : 'border border-line text-muted'
                  }`}
                  onClick={() => setKind('nft')}
                >
                  Register NFT creative
                </button>
              </div>
              {kind === 'media' ? (
                <form onSubmit={(e) => void onRegisterMedia(e)} className="space-y-3">
                  <h2 className="font-medium">{copy.registerMedia.title}</h2>
                  <FieldLabel label="File (hashed locally, never uploaded)" hintKey="mediaFile">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="mt-1 block w-full text-ink"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void onFile(file);
                      }}
                    />
                  </FieldLabel>
                  <p className="break-all text-xs text-muted">keccak: {hash || '—'}</p>
                  <Field name="uri" label="Public URI" hintKey="mediaUri" />
                  <FieldLabel label="MIME" hintKey="mime">
                    <select
                      name="mime"
                      defaultValue="image/png"
                      className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
                    >
                      <option value="image/png">image/png</option>
                      <option value="image/jpeg">image/jpeg</option>
                      <option value="image/webp">image/webp</option>
                      <option value="image/gif">image/gif</option>
                    </select>
                  </FieldLabel>
                  <div className="grid grid-cols-2 gap-3">
                    <Field name="width" label="Width" defaultValue="300" hintKey="creativeWidth" />
                    <Field name="height" label="Height" defaultValue="250" hintKey="creativeHeight" />
                  </div>
                  <Field name="clickUrl" label="Click URL" hintKey="clickUrl" />
                  <button
                    type="submit"
                    disabled={pending || !hash}
                    className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink disabled:opacity-40"
                  >
                    Register
                  </button>
                </form>
              ) : (
                <form onSubmit={(e) => void onRegisterNft(e)} className="space-y-3">
                  <h2 className="font-medium">{copy.registerNft.title}</h2>
                  <Field
                    name="nftChainId"
                    label="NFT chain id"
                    defaultValue={String(targetChainId)}
                    hintKey="nftChainId"
                  />
                  <Field name="nftContract" label="Contract" hintKey="nftContract" />
                  <Field name="nftTokenId" label="Token id" hintKey="nftTokenId" />
                  <FieldLabel label="Standard" hintKey="nftStandard">
                    <select
                      name="nftStandard"
                      defaultValue="1"
                      className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
                    >
                      <option value="1">ERC-721</option>
                      <option value="2">ERC-1155</option>
                    </select>
                  </FieldLabel>
                  <Field name="clickUrl" label="Click URL" hintKey="clickUrl" />
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink disabled:opacity-40"
                  >
                    Register NFT
                  </button>
                </form>
              )}
            </div>
          ),
        },
        {
          id: 'approval',
          title: copy.requestApproval.title,
          description: copy.requestApproval.description,
          whatNext: copy.requestApproval.whatNext,
          status: statusOf('approval'),
          content: (
            <form onSubmit={(e) => void onRequestApproval(e)} className="space-y-3">
              <h2 className="font-medium">{copy.requestApproval.title}</h2>
              <Field name="publisher" label="Publisher" hintKey="publisherAddress" />
              <FieldLabel label="Creative" hintKey="creativeId">
                {creativeIds.length > 0 ? (
                  <select
                    name="creativeId"
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
                  >
                    {creativeIds.map((id) => (
                      <option key={id} value={id}>
                        #{id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    name="creativeId"
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
                    aria-label="Creative id"
                  />
                )}
              </FieldLabel>
              <button
                type="submit"
                disabled={pending}
                className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink disabled:opacity-40"
              >
                Request
              </button>
            </form>
          ),
        },
      ]}
    />
  );
}
