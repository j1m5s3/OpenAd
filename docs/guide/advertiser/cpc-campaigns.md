# CPC campaigns

CPC is **not** a period **buy** and **not** an occupancy auction.

You pick a CPC **slot** and **creative**, set **max CPC** and a budget, then
sign a permit and `open_campaign`. USDC sits in the **campaign vault** until
clicks **settle** or you close the campaign.

Serve picks a winner at the publisher **floor CPC**. You pay the minimum needed
to win (GSP): never above your max CPC, never below floor CPC.

**Buy** is hidden on CPC slots. Use **Open campaign** on Campaigns.

You can top up remaining budget, pause, request close, then finalize close so
leftover USDC returns. The **settler** (not the web app) submits settle batches.
