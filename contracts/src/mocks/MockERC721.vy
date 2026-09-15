# pragma version ~=0.4.0
"""
@title MockERC721
@notice Minimal snekmate ERC-721 used in tests for CreativeRegistry same-chain NFT ownership.
"""

from snekmate.auth import ownable
from snekmate.tokens import erc721

initializes: ownable
initializes: erc721[ownable := ownable]

exports: (
    erc721.IERC721,
    erc721.safe_mint,
    erc721.owner,
)


@deploy
def __init__():
    ownable.__init__()
    erc721.__init__("Mock NFT", "MNFT", "", "Mock NFT", "1")
