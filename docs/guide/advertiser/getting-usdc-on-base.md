# Getting USDC on Base

OpenAd accepts **USDC** on **Base** only — no other token, and no other chain. If your wallet
does not already hold USDC on Base, get it there before you register a creative or buy a period.

## Ways to get there

- **Buy on an exchange that supports withdrawal to Base**, directly to your wallet address on the
  Base network.
- **Use a fiat-to-crypto onramp** that offers Base as a destination network.
- **Bridge USDC (or another asset) from another chain to Base**, then swap for USDC if needed.
  Some bridges deliver a **bridged USDC variant** with its own contract address rather than
  native USDC — check which one a bridge gives you before relying on it; only native USDC works
  with OpenAd (see "Check the token" below).

This guide does not recommend a specific exchange, onramp, or bridge, and makes no claim about
any provider's fees, speed, or availability. Compare providers yourself before using one.

## Before you send anything

- **Check the network.** Select **Base** as the destination network in the sending app. Sending
  to the wrong network can lose funds — OpenAd cannot recover them.
- **Check the token.** OpenAd uses native USDC on Base, and the buy flow is one permit signature
  (EIP-2612) plus one transaction, with no separate approval transaction. No OpenAd screen shows
  you the USDC contract address. Instead, compare the USDC token address your own wallet shows
  (in its token or balance view) — and, if your wallet displays it, the `verifyingContract` field
  in the permit signature request it asks you to sign when buying — against the address Circle
  publishes for Base. Do not assume a token is genuine native USDC just because it is labelled
  "USDC".
- **Keep some ETH on Base too.** Buying a period pays gas in ETH on Base, separate from the USDC
  price. Keep a small amount of ETH in the same wallet (no specific amount is given here — it
  depends on current network conditions).
- **Start small.** Send a small test amount first if you are new to Base or to the sending app.

## Official references

- [Base documentation](https://docs.base.org/) — network details, wallets, and getting started
  on Base.
- [Circle](https://www.circle.com/usdc) and [Circle Developer docs](https://developers.circle.com/)
  — Circle is USDC's issuer; use Circle's own site to find its published USDC contract address
  for Base rather than trusting a third party's.

Once USDC is in your wallet on Base, continue with [registering a creative](creatives.md) and
[buying a period](buy-a-period.md).
