# Base Sepolia deployment runbook (ROADMAP 1.5)

Live broadcast is **optional**. This session does not require a deployer key or
`contracts/deployments/84532.json`. GCP and Base mainnet (4.6) are out of scope.

## Prerequisites

1. A Moccasin encrypted wallet imported in a real terminal (agent terminals cannot paste keys):

   ```text
   cd contracts
   uv run mox wallet import base-sepolia
   ```

   Set `default_account_name` for `[networks.base-sepolia]` in `moccasin.toml`.

2. `.env` with `BASE_SEPOLIA_RPC_URL` (and optional `BASESCAN_API_KEY` for verify).
3. Circle testnet USDC at `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (PROTOCOL §10) — verify on the explorer before deploying.
4. The deployer EOA funded with Base Sepolia ETH. Do **not** put the key in `.env`.

## Broadcast

```text
cd contracts
uv run mox run deploy --network base-sepolia
```

That writes `contracts/deployments/84532.json` (commit this file). Then verify each
contract on Basescan if an API key is configured.

Update `docs/PROTOCOL.md` §10 with the live addresses after a successful broadcast.

## If no key is present

Leave `84532.json` uncommitted. Local Anvil (`31337.json`, git-ignored) is the supported
dev path via `.\scripts\setup.cmd`.
