# openad-contracts

Vyper 0.4 contracts for the OpenAd protocol, managed with [Moccasin](https://cyfrin.github.io/moccasin/)
and tested with titanoboa.

- **Semantics:** [`/docs/PROTOCOL.md`](../docs/PROTOCOL.md) (normative).
- **Signatures:** [`src/interfaces/*.vyi`](src/interfaces/) (canonical; implementations `implements:` them).
- **Coding rules:** [`/docs/CONVENTIONS.md`](../docs/CONVENTIONS.md) §3 and `.cursor/rules/vyper-contracts.mdc`.
- **Next tasks:** [`/docs/ROADMAP.md`](../docs/ROADMAP.md) Phase 1.

## Layout

```text
src/
  interfaces/          IAdSlot.vyi, IMarketplace.vyi, ICreativeRegistry.vyi   (canonical ABI)
  mocks/MockUSDC.vy    6-decimal ERC-20 + EIP-2612 permit for local/test use
  AdSlot.vy            (ROADMAP 1.2)  ERC-721 slots, calendars, leases, ERC-4907 views
  Marketplace.vy       (ROADMAP 1.3)  terms, Dutch pricing, buy / buy_with_permit
  CreativeRegistry.vy  (ROADMAP 1.1)  creatives, approvals, allowlists, moderator revoke
script/
  deploy.py            deploy order per PROTOCOL §10; writes deployments/<chainId>.json
  artifacts.py         artifact schema + writer (ARCHITECTURE §4.1)
tests/
  conftest.py          personas (publisher/advertiser/treasury), usdc_token fixture
  helpers.py           sign_permit(), usdc()
  test_*.py            one file per contract + test_invariants.py (hypothesis)
deployments/           <chainId>.json artifacts (31337 ignored; public networks committed)
```

## Commands

```bash
uv sync                          # venv with moccasin, vyper, snekmate, pytest, hypothesis
uv run mox compile               # -> out/
uv run mox test                  # titanoboa (pyevm), fast; use -k / -x as with pytest
uv run mox run deploy            # pyevm dry run (no artifact written)
uv run mox run deploy --network anvil          # docker compose up -d anvil first
uv run mox run deploy --network base-sepolia   # prompts; needs BASE_SEPOLIA_RPC_URL in ../.env
uv run vyper -p ./src <file.vy> -f abi          # compile a single file directly
```

### Wallets

Local Anvil deploy (`npm run stack:setup` / `mox run deploy --network anvil --private-key`)
uses Foundry account #0 from the comments in `../docker-compose.yml`. No wallet import.

Testnet and mainnet keys are Moccasin encrypted wallets, never `.env` values, and must be
imported in a real terminal (Cursor agent terminals cannot accept paste):

```bash
uv run mox wallet import base-sepolia # your testnet key; then set default_account_name in moccasin.toml
```

## Writing a contract here

1. Read the relevant `PROTOCOL.md` sections listed in the ROADMAP task and the `.vyi`.
2. `from interfaces import IAdSlot` … `implements: IAdSlot`. Compose snekmate modules; do not
   export snekmate's `safe_mint` on `AdSlot`.
3. Revert strings exactly as in `PROTOCOL.md`; tests assert on them with `boa.reverts("…")`.
4. Add `tests/test_<contract>.py`; property tests for the invariants in `PROTOCOL.md` §8 go in
   `tests/test_invariants.py` using `hypothesis`.
5. Wire the contract into `script/deploy.py::deploy_protocol` (ROADMAP 1.4).

## Windows note

`mox install` rewrites `moccasin.toml` using the Windows code page and doubled CRs, which then
breaks `mox compile`. We therefore install snekmate through `pyproject.toml` (Vyper resolves
modules from the venv) and keep `moccasin.toml` ASCII-only. Do not run `mox install`.
