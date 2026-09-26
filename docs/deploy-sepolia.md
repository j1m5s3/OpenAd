# Base Sepolia deployment runbook (ROADMAP 1.5)

Live broadcast is **optional**. This session does not require a deployer key or
`contracts/deployments/84532.json`. GCP and Base mainnet (4.6) are out of scope.

Hosting the api/indexer/settler/web on GCP once `84532.json` exists: `docs/deploy-gcp.md` (ADR-0017).

## Prerequisites

1. A Moccasin encrypted wallet imported in a real terminal (agent terminals cannot paste keys):

   ```text
   cd contracts
   uv run mox wallet import base-sepolia
   ```

   Set `default_account_name` for `[networks.base-sepolia]` in `moccasin.toml`, or pass
   `--account <wallet name>` to the deploy command below instead.

2. `.env` with `BASE_SEPOLIA_RPC_URL` (and optional `BASESCAN_API_KEY` for verify). The public
   `https://sepolia.base.org` works but rate-limits; a provider URL such as Alchemy's
   (`https://base-sepolia.g.alchemy.com/v2/<key>`) avoids that. Alchemy's endpoint serves
   Flashblocks pre-confirmation receipts (all-zero `blockHash`), which titanoboa would take as
   final and crash on (`'NoneType' object is not subscriptable` after the first transaction).
   `script/deploy.py` and `script/set_settler.py` wait for each receipt's block to be sealed
   first (`script/receipts.py`), so either URL works.
3. Circle testnet USDC at `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (PROTOCOL §10) — verify on the explorer before deploying.
4. The deployer EOA funded with Base Sepolia ETH. Do **not** put the key in `.env`.
5. A dedicated settler EOA, and its address in `OPENAD_SETTLER_ADDRESS` (next section).

## Settler EOA

The CPC settler process (`python -m openad.settler`, ADR-0014) signs
`CampaignVault.settle_batch` with a hot key, `OPENAD_SETTLER_KEY`. That key belongs to a
**dedicated EOA that holds gas only**. It is never the deployer's key: the deployer owns every
protocol contract, so its key in the settler container would let whoever takes that key call
`set_settler`, `set_treasury`, `set_fee_bps` and `AdSlot.set_market` (threat model T20). Only
Anvil and pyevm may use the deployer as the settler.

1. Create a new EOA for the settler only, and never print its key to a shared terminal. For
   example, `cast wallet new` (Foundry) in a private terminal: it prints the key. Or write the
   key straight to a file only you can read, with eth_account from the api venv:

   ```text
   cd api
   uv run python -c "
   import os
   from eth_account import Account
   acct = Account.create()
   fd = os.open(os.path.expanduser('~/openad-settler-<ENV>.key'), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
   with os.fdopen(fd, 'w') as f:
       f.write(acct.key.to_0x_hex())
   print(acct.address)
   "
   ```

   It prints only the address. The file holds the `0x`-prefixed key with no trailing newline,
   which is the form `OPENAD_SETTLER_KEY` takes.
2. Fund it with a little Base Sepolia ETH, for gas only. It never needs USDC: `settle_batch`
   pays out of the vault.
3. Export its address for the deploy, in the shell only: `export OPENAD_SETTLER_ADDRESS=<its
   address>`. Don't put it in the repo-root `.env`: Moccasin loads that file for every network,
   so the next local Anvil deploy (`setup`, `dev-up`) would make this EOA the local settler, and
   local CPC settlement would stop, because the local settler signs with Anvil #0's key. The
   address isn't a secret; the key is.
4. Store the key as `openad-settler-key-<ENV>` (`docs/deploy-gcp.md` §5), then delete the local
   file.

The deploy refuses to run on Base Sepolia without `OPENAD_SETTLER_ADDRESS`, or when it is the
deployer's address, before it spends any gas. Off chain 31337 the settler process refuses to
start if its key owns `CampaignVault` or is the deployer.

### Rotating the settler key

1. Create and fund a new settler EOA, as above.
2. Add its key as a new version of the secret (inferred; verify before deploy):
   `gcloud secrets versions add openad-settler-key-<ENV> --data-file=<new key file>`.
3. Point the vault at it, from the owner (the deployer's Moccasin wallet):

   ```text
   cd contracts
   OPENAD_SETTLER_ADDRESS=<new address> uv run mox run set_settler --network base-sepolia
   ```

   It refuses the vault owner's address and the deployer's (from `84532.json`), even after
   ownership has moved, and a sender that isn't the owner. It prints the old and the new
   settler, then `settler()` once the transaction lands.
4. Redeploy `openad-settler` on the new secret version, so that a new revision starts with the
   new key. For example, with the version number that step 2 printed (inferred; verify before
   deploy):

   ```text
   gcloud run services update openad-settler --region=<REGION> \
     --update-secrets=OPENAD_SETTLER_KEY=openad-settler-key-<ENV>:<VERSION>
   ```

   Pinning the number changes the revision, so it can't be a no-op; a later
   `scripts/deploy-gcp.sh --only stack` goes back to `latest`, which is the same version. The
   new revision logs `settler.identity_checked` with the new address.

Between steps 3 and 4 the running settler's batches revert with "not settler". It leaves those
clicks unsettled and retries them, so the new key settles them after the redeploy. A settler
whose key isn't `settler()` yet starts anyway and logs `settler.not_current_settler`. Once
step 3 lands the old key has no protocol role: move its leftover gas out and disable its secret
version.

## Broadcast

```text
cd contracts
OPENAD_SETTLER_ADDRESS=<settler EOA address> uv run mox run deploy --network base-sepolia
```

In PowerShell on Windows, set the variables first (a `VAR=value command` prefix is bash only):

```text
cd contracts
$env:BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org"   # or your RPC provider's URL
$env:OPENAD_SETTLER_ADDRESS = "<settler EOA address>"
uv run mox run deploy --network base-sepolia --account <wallet name>
```

It asks for the Moccasin wallet's password, and `prompt_live` asks you to confirm the live
network, so run it in a real terminal. The deploy prints the settler it sets, and writes
`contracts/deployments/84532.json` (commit this file). Then verify each contract on Basescan if an API key is configured.

Update `docs/PROTOCOL.md` §10 with the live addresses after a successful broadcast.

## If no key is present

Leave `84532.json` uncommitted. Local Anvil (`31337.json`, git-ignored) is the supported
dev path via `.\scripts\setup.cmd`.
