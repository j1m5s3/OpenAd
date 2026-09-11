# Playwright E2E (ADR-0010)

YAML scenarios in `scenarios/` are the contract between generators and tests.
Personas use Anvil accounts #1 (publisher) and #2 (advertiser) via an in-page mock EIP-1193 provider.

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

Scenarios: `scenarios/gen1-*.yaml` through `gen4-*.yaml` (nav, Supply, Campaigns, filters,
mobile, pause, allowlist, indexer lag, connect, ended). A generation is clean when the full suite is green
and no new failing cases were added.
