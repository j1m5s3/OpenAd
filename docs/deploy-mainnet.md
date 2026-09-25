# Base mainnet deployment runbook (ROADMAP 4.6)

Do **not** broadcast from this repository until a later explicit request. There is no
`contracts/deployments/8453.json` in tree.

Hosting the api/indexer/settler/web on GCP once `8453.json` exists: `docs/deploy-gcp.md` (ADR-0017).

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

## Settler EOA

The CPC settler signs `CampaignVault.settle_batch` with a hot key in the settler container
(threat model T20), so it is a **dedicated, gas-only EOA**: never the Safe, never one of the
Safe's signers, and never the deployer. Create, fund and store it as in `docs/deploy-sepolia.md`
("Settler EOA"), with Base ETH for gas; it never needs USDC.

- The deploy script requires `OPENAD_SETTLER_ADDRESS` on Base and refuses the deployer's
  address, before it spends any gas.
- Once the Safe owns `CampaignVault`, `set_settler` goes through the Safe. For a rotation,
  `OPENAD_SETTLER_ADDRESS=<new address> uv run mox run set_settler --network base` sends
  nothing: it prints the transaction (`to`, `value`, `data`) to propose from the Safe. It
  refuses the Safe's address and the deployer's (from `8453.json`). The rest of the rotation
  (the new secret version, then redeploying `openad-settler`) is as in `docs/deploy-sepolia.md`.

## Broadcast (when authorized)

```text
cd contracts
OPENAD_SETTLER_ADDRESS=<settler EOA address> uv run mox run deploy --network base
```

Commit `8453.json` only after a successful broadcast. Verify on Basescan. Update PROTOCOL §10.

## Non-custodial reminder

The deploy key (or Safe) is the contract owner. It must never be loaded by `api/` or `web/`,
nor by the settler: the settler process holds only the settler EOA's key, and off chain 31337 it
refuses to start if its key owns `CampaignVault` or is the deployer.
Gas sponsorship, if added later, uses a Base paymaster — not an API signer.
