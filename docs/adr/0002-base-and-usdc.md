# ADR-0002: Settle on Base in USDC

- **Status:** Accepted
- **Date:** 2026-09-08
- **Scope:** contracts, api, web

## Context

The protocol needs one chain and one settlement currency for v1. Requirements: low fees (ad
periods can be cheap; per-buy gas must be negligible), a widely held stablecoin with
single-transaction approval, good wallet UX, and an active crypto-native publisher ecosystem.

## Decision

- **Chain:** Base (8453). Staging on Base Sepolia (84532). Local development on Anvil (31337).
- **Currency:** native USDC (6 decimals) with EIP-2612 `permit`, so a buy is a single
  transaction (`Marketplace.buy_with_permit`).
- All prices, fees, and balances are `uint256` USDC base units. No other tokens in v1.

## Alternatives considered

- **Ethereum mainnet** — gas makes small periods uneconomic.
- **Arbitrum / Optimism** — viable; Base chosen for Coinbase Smart Wallet distribution and
  paymaster availability, which matter for later web2-publisher onboarding (ROADMAP 4.5).
- **Multi-currency (USDT, DAI)** — adds price-oracle and UX complexity for no v1 benefit.
  Revisit after launch if publishers ask.
- **Permit2** — more general but requires an extra approval to the Permit2 contract; native
  EIP-2612 on USDC is simpler for users.

## Consequences

- `Marketplace` takes `USDC` as an immutable constructor argument; a new currency means a new
  deployment.
- Tests must run against a permit-capable mock (`MockUSDC` via snekmate `erc20`) and, in fork
  tests, against real Base USDC.
- Chain ids and USDC addresses are tabulated in `PROTOCOL.md` §10 and must be verified before
  each deployment.
