# Creatives

A **creative** is immutable after registration (except revocation).

**MEDIA** — public URI, keccak hash of the bytes (computed in your browser; the
file is never uploaded to OpenAd), MIME (`image/png`, `jpeg`, `webp`, `gif`),
width/height, click URL.

**NFT_REF** — same-chain NFT you own (ERC-721 or ERC-1155), plus click URL.

Dimensions should match the **slot**. A moderator can globally revoke a
creative; a publisher can reject it for their inventory.
