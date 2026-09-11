# JIT_PLAN — Prod-ready OpenAd (GCP leftover)

Approved plan: `.cursor/plans/prod_ready_platform_fbd5a5d1.plan.md` (do not edit).
Decisions: ADR-0008 Tailwind+RainbowKit, ADR-0009 SIWE, ADR-0010 Playwright YAML,
ADR-0011 env-gated Turnkey. Skip live GCP and Base mainnet.

## Waves

0. Docs/ADRs (this file + adr 0008–0011) — in progress then done with first commit-quality docs.
1. Contracts 1.1–1.4; Sepolia runbook for 1.5.
2. API 2.1–2.6 (Alembic, media, serve, public reads, embed).
3. Web Discover/Supply/Campaigns + SIWE + OpenAPI client.
4. Late buy, autopilot, threat model, CF worker source, Turnkey stub.
5. Playwright scenario loop until two clean generations.
6. CI + Dockerfiles (no GCP).
