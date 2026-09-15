# Fees and permits

The platform **fee** is `fee_bps` (max 10%) of each Lease **buy** and each CPC
`settle_batch`. It goes to treasury in that same transaction. The rest goes to
the **publisher**. `Marketplace` holds no USDC after a buy. The **campaign
vault** may hold campaign remaining until settle or close.

A **permit** is an EIP-2612 signature: exact USDC amount, about a one-hour
deadline, spender is `Marketplace` (buy) or `CampaignVault` (open/top-up). Then
one transaction. You can always reject the signature in your wallet.
