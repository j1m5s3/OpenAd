# pragma version ~=0.4.0
"""
@title MockUSDC
@notice Test-only stand-in for USDC: 6 decimals, EIP-2612 permit, owner-gated mint.
        Used on Anvil and in titanoboa tests. Never deploy to a public network.
@dev    Composed from snekmate's erc20 (which already implements EIP-2612) and ownable.
        The deployer is owner and minter.
"""

from snekmate.auth import ownable
from snekmate.tokens import erc20

initializes: ownable
initializes: erc20[ownable := ownable]

exports: (
    erc20.IERC20,
    erc20.IERC20Detailed,
    erc20.IERC20Permit,
    erc20.mint,
    erc20.set_minter,
    erc20.owner,
)


@deploy
@payable
def __init__():
    ownable.__init__()
    erc20.__init__("USD Coin (Mock)", "USDC", 6, "USD Coin (Mock)", "2")
