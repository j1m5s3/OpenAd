import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { BaseError, type Hex } from 'viem';
import {
  useAccount,
  useReadContract,
  useSignTypedData,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import { routes } from '../../../app/paths';
import { FieldLabel } from '../../../components/Field';
import { Wizard } from '../../../components/Wizard';
import { DEMO_MODE } from '../../../demo/flag';
import { leaseIndexerNote, WIZARD_COPY } from '../../../lib/copy';
import { withDevWalletParam } from '../../../lib/devWalletQuery';
import { formatUnixSeconds, formatUsdc, shortAddress } from '../../../lib/format';
import { getContract, hasProtocol } from '../../../lib/deployments';
import {
  buyCtaLabel,
  permitDeadline,
  quoteFeeCopy,
  splitSignature,
  usdcPermitTypes,
} from '../../../lib/permit';
import { explorerTxUrl, targetChainId } from '../../../lib/wagmi';
import { useAdvertiser, useAdvertiserCreatives } from '../../advertiser/api';

type Quote = {
  sellable: boolean;
  reason: string;
  price: bigint;
  fee: bigint;
  open_at?: bigint;
  start?: bigint;
  end?: bigint;
};

/** The quote actually signed for the permit, frozen at submit so the receipt never re-quotes a
 * period that is now leased (ROADMAP 6.2 step 35 — a live re-quote after the lease lands returns
 * price 0 / "Not sellable", which reads as a failed $0 buy). */
type Snapshot = {
  price: bigint;
  fee: bigint;
  periodIndex: string;
  slotId: string;
  creativeId: string;
  remainder: boolean;
  start: bigint | undefined;
  end: bigint | undefined;
};

/** A wallet/RPC error's short, human message — `BaseError.shortMessage` (e.g. "User rejected the
 * request.") over the long revert-data-laden `.message` viem otherwise gives. */
function errorText(err: unknown): string {
  if (err instanceof BaseError) return err.shortMessage;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function BuyDialog({
  slotId,
  periodIndex,
  remainder = false,
  onClose,
}: {
  slotId: string;
  periodIndex: string;
  remainder?: boolean;
  onClose: () => void;
}) {
  const { address, isConnected } = useAccount();
  const dash = useAdvertiser(address);
  const creativeQueries = useAdvertiserCreatives(dash.data?.creativeIds);
  const owned = creativeQueries
    .map((q) => q.data)
    .filter((c): c is NonNullable<typeof c> => Boolean(c && !c.revoked));
  const [creativeId, setCreativeId] = useState('1');
  const [txHash, setTxHash] = useState<Hex | undefined>(undefined);
  const [step, setStep] = useState('review');
  const [submitted, setSubmitted] = useState<Snapshot | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const deployed = hasProtocol(targetChainId);
  const market = deployed ? getContract(targetChainId, 'Marketplace') : null;
  const usdc = deployed ? getContract(targetChainId, 'USDC') : null;
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync, isPending } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: Boolean(txHash) },
  });

  useEffect(() => {
    const first = dash.data?.creativeIds[0];
    if (first) setCreativeId(first);
  }, [dash.data?.creativeIds]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Stops re-quoting once the user has submitted: after the lease lands the same query would
  // return price 0 / not sellable, which is what step 35 fixes.
  const quote = useReadContract({
    address: market?.address,
    abi: market?.abi,
    functionName: 'quote',
    args: [BigInt(slotId), BigInt(periodIndex)],
    query: { enabled: Boolean(market) && !submitted, refetchInterval: 4_000 },
  });

  const tokenName = useReadContract({
    address: usdc?.address,
    abi: usdc?.abi,
    functionName: 'name',
    query: { enabled: Boolean(usdc) },
  });

  const nonce = useReadContract({
    address: usdc?.address,
    abi: usdc?.abi,
    functionName: 'nonces',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: Boolean(usdc && address) },
  });

  const q = quote.data as Quote | undefined;
  const price = submitted?.price ?? q?.price ?? 0n;
  const fee = submitted?.fee ?? q?.fee ?? 0n;
  const feeCopy = quoteFeeCopy(price, fee);
  const errorMessage =
    buyError ??
    (receipt.isError ? (receipt.error ? errorText(receipt.error) : 'Transaction failed') : null);
  const waiting = isPending || (Boolean(submitted) && !receipt.isSuccess && !errorMessage);
  const buyCopy = WIZARD_COPY.buyPeriod;
  const stepIds = ['review', 'cost', 'confirm'] as const;
  const statusOf = (id: string) => {
    const a = stepIds.indexOf(step as (typeof stepIds)[number]);
    const i = stepIds.indexOf(id as (typeof stepIds)[number]);
    if (i < a) return 'done' as const;
    if (i === a) return 'active' as const;
    return 'todo' as const;
  };

  async function onBuy() {
    if (!market || !usdc || !address || !q) return;
    setBuyError(null);
    setTxHash(undefined);
    setSubmitted({
      price: q.price,
      fee: q.fee,
      periodIndex,
      slotId,
      creativeId,
      remainder,
      start: q.start,
      end: q.end,
    });
    try {
      const deadline = permitDeadline();
      const typedName = typeof tokenName.data === 'string' ? tokenName.data : 'USD Coin';
      const signature = await signTypedDataAsync({
        domain: {
          name: typedName,
          version: '2',
          chainId: targetChainId,
          verifyingContract: usdc.address,
        },
        types: usdcPermitTypes,
        primaryType: 'Permit',
        message: {
          owner: address,
          spender: market.address,
          value: q.price,
          nonce: typeof nonce.data === 'bigint' ? nonce.data : 0n,
          deadline,
        },
      });
      const { v, r, s } = splitSignature(signature as Hex);
      const hash = await writeContractAsync({
        address: market.address,
        abi: market.abi,
        functionName: 'buy_with_permit',
        args: [BigInt(slotId), BigInt(periodIndex), BigInt(creativeId), q.price, deadline, v, r, s],
      });
      setTxHash(hash);
    } catch (err) {
      setBuyError(errorText(err));
    }
  }

  function retry() {
    setBuyError(null);
    setTxHash(undefined);
    setSubmitted(null);
  }

  async function copyTxHash(hash: Hex) {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied (e.g. an insecure context); the hash is still on-page.
    }
  }

  const explorerUrl = txHash ? explorerTxUrl(targetChainId, txHash) : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="buy-dialog-title"
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="buy-dialog-title" className="text-lg font-semibold">
            Buy period {periodIndex}
          </h2>
          <button type="button" className="text-muted" onClick={onClose}>
            Close
          </button>
        </div>
        {submitted ? (
          <div className="mt-4 space-y-3">
            <h3 className="text-lg font-semibold">
              {errorMessage
                ? 'Buy failed'
                : receipt.isSuccess
                  ? 'Lease confirmed'
                  : txHash
                    ? 'Waiting for confirmation…'
                    : 'Sign the permit in your wallet…'}
            </h3>
            <p className="text-2xl font-semibold">{formatUsdc(price)}</p>
            <p className="text-sm text-muted">{feeCopy.line}</p>
            {submitted.start != null && submitted.end != null && (
              <p className="text-sm text-muted">
                {formatUnixSeconds(Number(submitted.start))} –{' '}
                {formatUnixSeconds(Number(submitted.end))}
              </p>
            )}
            {txHash && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <span>{shortAddress(txHash, 6)}</span>
                <button
                  type="button"
                  onClick={() => void copyTxHash(txHash)}
                  className="rounded-full border border-line px-2 py-0.5 text-xs text-ink"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
                {explorerUrl && (
                  <a href={explorerUrl} target="_blank" rel="noreferrer" className="text-accent">
                    View on explorer
                  </a>
                )}
              </div>
            )}
            {errorMessage && <p className="text-sm text-ink">{errorMessage}</p>}
            {receipt.isSuccess && (
              <p className="text-sm text-muted">{leaseIndexerNote(DEMO_MODE)}</p>
            )}
            <div className="flex gap-2">
              {receipt.isSuccess && (
                <>
                  <Link
                    to={routes.slot(submitted.slotId)}
                    onClick={onClose}
                    className="flex-1 rounded-full bg-accent py-2 text-center font-medium text-accent-ink"
                  >
                    View slot
                  </Link>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-full border border-line py-2 font-medium text-ink"
                  >
                    Done
                  </button>
                </>
              )}
              {errorMessage && (
                <button
                  type="button"
                  onClick={retry}
                  className="flex-1 rounded-full bg-accent py-2 font-medium text-accent-ink"
                >
                  Try again
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">
              Live quote from Marketplace. One USDC permit transaction — fee to treasury, rest to
              the publisher, nothing left in Marketplace.
            </p>
            <div className="mt-4">
              <Wizard
                bare
                activeId={step}
                onSelect={setStep}
                steps={[
                  {
                    id: 'review',
                    title: buyCopy.review.title,
                    description: buyCopy.review.description,
                    whatNext: buyCopy.review.whatNext,
                    status: statusOf('review'),
                    content: (
                      <div>
                        <p className="text-2xl font-semibold">
                          {quote.isFetching ? '…' : formatUsdc(price)}
                        </p>
                        {q && !q.sellable && (
                          <p className="mt-2 text-sm text-ink">{q.reason || 'not sellable'}</p>
                        )}
                      </div>
                    ),
                  },
                  {
                    id: 'cost',
                    title: buyCopy.cost.title,
                    description: buyCopy.cost.description,
                    whatNext: buyCopy.cost.whatNext,
                    status: statusOf('cost'),
                    content: (
                      <div className="space-y-3">
                        {q && <p className="text-sm text-muted">{feeCopy.line}</p>}
                        <FieldLabel label="Creative" hintKey="buyCreative">
                          {owned.length > 0 ? (
                            <select
                              value={creativeId}
                              onChange={(e) => setCreativeId(e.target.value)}
                              className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
                            >
                              {owned.map((c) => (
                                <option key={c.creativeId} value={c.creativeId}>
                                  #{c.creativeId} · {c.mime} · {c.width}×{c.height}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={creativeId}
                              onChange={(e) => setCreativeId(e.target.value)}
                              className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
                              aria-label="Creative id"
                            />
                          )}
                        </FieldLabel>
                        {isConnected && owned.length === 0 && (
                          <p className="text-sm text-muted">
                            No creatives on this wallet.{' '}
                            <Link className="text-accent" to={withDevWalletParam(routes.campaigns)}>
                              Register one on Campaigns
                            </Link>{' '}
                            before buying (approval required unless the publisher waived it).
                          </p>
                        )}
                      </div>
                    ),
                  },
                  {
                    id: 'confirm',
                    title: buyCopy.confirm.title,
                    description: buyCopy.confirm.description,
                    whatNext: buyCopy.confirm.whatNext,
                    status: statusOf('confirm'),
                    content: (
                      <div className="space-y-3">
                        <p className="text-2xl font-semibold">
                          {quote.isFetching ? '…' : formatUsdc(price)}
                        </p>
                        {q && <p className="text-sm text-muted">{feeCopy.line}</p>}
                        {!isConnected && (
                          <p className="text-sm text-ink">
                            Connect a wallet to sign the permit and buy.
                          </p>
                        )}
                        <button
                          type="button"
                          disabled={!isConnected || !q?.sellable || waiting || quote.isFetching}
                          onClick={() => void onBuy()}
                          className="w-full rounded-full bg-accent py-2 font-medium text-accent-ink disabled:opacity-40"
                        >
                          {buyCtaLabel(Boolean(q?.sellable), remainder)}
                        </button>
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
