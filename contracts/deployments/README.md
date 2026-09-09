# Deployments artifacts

`<chainId>.json` files written by `script/deploy.py`. Schema in `docs/ARCHITECTURE.md` §4.1.

- `31337.json` (Anvil) is regenerated locally and git-ignored.
- `84532.json` (Base Sepolia) and `8453.json` (Base) are committed and are the addresses the
  API and web app use. Update them only via the deploy script, never by hand.
