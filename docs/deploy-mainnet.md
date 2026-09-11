# Base mainnet deployment runbook (ROADMAP 4.6)

Do **not** broadcast from this repository until a later explicit request. There is no
`contracts/deployments/8453.json` in tree.

## Owner and timelock

1. Deploy `CreativeRegistry`, `AdSlot`, `Marketplace` with a **multisig** as Ownable owner
   (not an EOA). Suggested: a 2-of-3 or 3-of-5 Safe on Base.
2. After `AdSlot.set_market(Marketplace)`, wrap further `set_market` behind a **timelock**
   (for example a 48h Safe module or OpenZeppelin-style timelock owned by the same Safe).
   Changing `market` is the only way to rewrite leases.
3. `set_fee_bps` / `set_treasury` / `set_moderator` stay on the Safe without a long delay
   (operational), but still require the multisig threshold.
4. USDC is native Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (verify on-chain
   before deploy). `fee_bps` is TBD by the platform (PROTOCOL §10).

## Broadcast (when authorized)

```text
cd contracts
uv run mox run deploy --network base
```

Commit `8453.json` only after a successful broadcast. Verify on Basescan. Update PROTOCOL §10.

## Non-custodial reminder

The deploy key (or Safe) is the contract owner. It must never be loaded by `api/` or `web/`.
Gas sponsorship, if added later, uses a Base paymaster — not an API signer.
