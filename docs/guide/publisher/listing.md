# Listing

A **listing** is a short, publisher-written description of your slot's
audience: who reads the page, what it's about, and up to 3 categories. It is
**self-described, not verified**, and shown to advertisers as
"Publisher-provided" — it is not the **slot** itself, has nothing to do with
**Terms**, and is never on-chain.

Advertisers use it (and the category filter on Discover) to judge audience fit
before they buy a period or open a campaign.

## Editing a listing

On Supply, under **Listing**:

1. Pick the **Slot to describe**.
2. Write a one-line **Summary** (up to 140 characters) — your pitch to an
   advertiser.
3. Write a longer **Audience** description (up to 600 characters) — who reads
   this page and why.
4. Pick up to 3 **Categories** from the fixed list (DeFi, NFT, Infrastructure,
   Developer tools, Wallets, Layer 2, Gaming, DAO governance, Security, News &
   media, Education, Other).
5. **Save**. **Clear** removes the listing entirely.

Only the slot's owner (the connected wallet that holds the slot NFT) can write
or clear its listing — the same SIWE-guarded, owner-only check as the
[house ad](house-ads-and-embed.md).

## Validation

The summary and audience are stripped and have their internal whitespace
collapsed. A write is rejected (422) if:

- the summary or audience is empty or exceeds its character limit,
- either field contains a control or invisible-formatting character (hidden
  Unicode tricks like a right-to-left override or a zero-width space are
  rejected, not just ASCII control codes),
- the summary contains a URL (no link spam — the slot's domain is already
  shown; see below for the tech-name exceptions),
- more than 3 distinct categories are given (after de-duplicating), or one
  isn't in the fixed list.

### The URL check

A summary is rejected if it has a scheme (`https://`, `ftp://`, …), a `www.`
prefix, or a bare host such as `example.com` or `shop.com.py`. Fullwidth and
CJK full stops are folded to `.`, and zero-width joiners (U+200D) are removed,
before the check runs — so `example．com`, and `evil.com` with a zero-width
joiner hidden before or after the dot, are caught too.

A bare `name.suffix` is allowed only when the suffix is one of these common
file-extension / tech names:

`js`, `jsx`, `mjs`, `cjs`, `ts`, `tsx`, `go`, `rb`, `sol`, `java`, `cpp`, `php`

so "Node.js devs", "ethers.js users" and "audit.sol" pass. As far as we know
none of these is a real top-level domain today. `.py` (Paraguay) and `.rs`
(Serbia) are real country domains, so "main.py" or "lib.rs" is rejected.

The trade-off: some allowed forms still look like a host name to a reader
(`evil.js`, `shop.go`). That is acceptable because listing text is always
rendered as plain, escaped text — never as a link or as HTML — so nothing in a
listing is clickable.

**The URL check is a heuristic and not exhaustive.** Known bypasses include a
spaced-out host (`example . com`), a "defanged" dot (`example[.]com`), a bare
IP address (`192.0.2.1`), an @handle (`@openad`), and some Unicode dot
lookalikes (for example `·`, U+00B7 MIDDLE DOT). It exists to discourage link
spam, not as a security boundary.

## Where it shows up

- **Discover** — a category filter, and each matching slot card shows the
  summary and category badges.
- **The slot page** — an "About this audience" section with the summary,
  audience text and categories, labelled "Publisher-provided".
