# pragma version ~=0.4.0
"""
@title CreativeRegistry
@notice Immutable creatives, per-publisher approvals/allowlists, moderator revocation.
@dev    Semantics: docs/PROTOCOL.md §3.3, §5.3, §6, §8 (7, 8).
"""

from ethereum.ercs import IERC721
from snekmate.auth import ownable
from interfaces import ICreativeRegistry

implements: ICreativeRegistry

initializes: ownable
exports: (ownable.owner, ownable.transfer_ownership, ownable.renounce_ownership)

event CreativeRegistered:
    creative_id: indexed(uint256)
    advertiser: indexed(address)
    kind: uint8
    content_hash: bytes32
    uri: String[512]
    mime: String[64]
    width: uint16
    height: uint16
    click_url: String[512]

event NftCreativeRegistered:
    creative_id: indexed(uint256)
    nft_chain_id: uint64
    nft_contract: address
    nft_token_id: uint256
    nft_standard: uint8

event ApprovalRequested:
    publisher: indexed(address)
    creative_id: indexed(uint256)
    advertiser: address

event ApprovalSet:
    publisher: indexed(address)
    creative_id: indexed(uint256)
    status: uint8

event AdvertiserAllowed:
    publisher: indexed(address)
    advertiser: indexed(address)
    allowed: bool

event CreativeRevoked:
    creative_id: indexed(uint256)
    by: address

event ModeratorSet:
    moderator: address

KIND_MEDIA: constant(uint8) = 0
KIND_NFT_REF: constant(uint8) = 1
NFT_NONE: constant(uint8) = 0
NFT_ERC721: constant(uint8) = 1
NFT_ERC1155: constant(uint8) = 2
STATUS_NONE: constant(uint8) = 0
STATUS_REQUESTED: constant(uint8) = 1
STATUS_APPROVED: constant(uint8) = 2
STATUS_REJECTED: constant(uint8) = 3
STATUS_REVOKED: constant(uint8) = 4

next_id: public(uint256)
creatives: HashMap[uint256, ICreativeRegistry.Creative]
approvals: HashMap[address, HashMap[uint256, uint8]]
allowed_advertisers: HashMap[address, HashMap[address, bool]]
moderator: public(address)


@deploy
def __init__():
    """@notice Platform owner is the deployer; first creative id is 1."""
    ownable.__init__()
    self.next_id = 1


@internal
@view
def _exists(creative_id: uint256) -> bool:
    return creative_id != 0 and creative_id < self.next_id


@internal
@view
def _is_active(creative_id: uint256) -> bool:
    if not self._exists(creative_id):
        return False
    return not self.creatives[creative_id].revoked


@internal
@view
def _is_blocked_for(publisher: address, creative_id: uint256) -> bool:
    if not self._exists(creative_id):
        return True
    if self.creatives[creative_id].revoked:
        return True
    status: uint8 = self.approvals[publisher][creative_id]
    return status == STATUS_REJECTED or status == STATUS_REVOKED


@internal
@view
def _require_creative(creative_id: uint256) -> ICreativeRegistry.Creative:
    assert self._exists(creative_id), "no creative"
    return self.creatives[creative_id]


@external
def register_media(
    uri: String[512],
    content_hash: bytes32,
    mime: String[64],
    width: uint16,
    height: uint16,
    click_url: String[512],
) -> uint256:
    """
    @notice Register an immutable hosted-media creative owned by msg.sender.
    @dev    Reverts "bad hash", "bad uri", "bad mime", "bad dimensions".
    @return creative_id (first id is 1).
    """
    assert content_hash != empty(bytes32), "bad hash"
    assert len(uri) > 0, "bad uri"
    assert len(mime) > 0, "bad mime"
    assert width > 0 and height > 0, "bad dimensions"
    creative_id: uint256 = self.next_id
    self.next_id = creative_id + 1
    self.creatives[creative_id] = ICreativeRegistry.Creative(
        advertiser=msg.sender,
        kind=KIND_MEDIA,
        uri=uri,
        content_hash=content_hash,
        mime=mime,
        width=width,
        height=height,
        click_url=click_url,
        nft_chain_id=0,
        nft_contract=empty(address),
        nft_token_id=0,
        nft_standard=NFT_NONE,
        revoked=False,
    )
    log CreativeRegistered(
        creative_id=creative_id,
        advertiser=msg.sender,
        kind=KIND_MEDIA,
        content_hash=content_hash,
        uri=uri,
        mime=mime,
        width=width,
        height=height,
        click_url=click_url,
    )
    return creative_id


@external
def register_nft(
    nft_chain_id: uint64,
    nft_contract: address,
    nft_token_id: uint256,
    nft_standard: uint8,
    click_url: String[512],
) -> uint256:
    """
    @notice Register an NFT-reference creative. Same-chain ERC-721 ownership is checked
            on-chain; other cases are verified off-chain.
    @dev    Reverts "bad standard", "bad contract", "not nft owner".
    """
    assert nft_standard == NFT_ERC721 or nft_standard == NFT_ERC1155, "bad standard"
    assert nft_contract != empty(address), "bad contract"
    if nft_chain_id == convert(chain.id, uint64) and nft_standard == NFT_ERC721:
        owner: address = staticcall IERC721(nft_contract).ownerOf(nft_token_id)
        assert owner == msg.sender, "not nft owner"
    creative_id: uint256 = self.next_id
    self.next_id = creative_id + 1
    self.creatives[creative_id] = ICreativeRegistry.Creative(
        advertiser=msg.sender,
        kind=KIND_NFT_REF,
        uri="",
        content_hash=empty(bytes32),
        mime="",
        width=0,
        height=0,
        click_url=click_url,
        nft_chain_id=nft_chain_id,
        nft_contract=nft_contract,
        nft_token_id=nft_token_id,
        nft_standard=nft_standard,
        revoked=False,
    )
    log CreativeRegistered(
        creative_id=creative_id,
        advertiser=msg.sender,
        kind=KIND_NFT_REF,
        content_hash=empty(bytes32),
        uri="",
        mime="",
        width=0,
        height=0,
        click_url=click_url,
    )
    log NftCreativeRegistered(
        creative_id=creative_id,
        nft_chain_id=nft_chain_id,
        nft_contract=nft_contract,
        nft_token_id=nft_token_id,
        nft_standard=nft_standard,
    )
    return creative_id


@external
def request_approval(publisher: address, creative_id: uint256):
    """
    @notice Ask a publisher to approve a creative. Creative owner only.
    @dev    Reverts "not creative owner", "inactive", "bad status".
    """
    c: ICreativeRegistry.Creative = self._require_creative(creative_id)
    assert c.advertiser == msg.sender, "not creative owner"
    assert not c.revoked, "inactive"
    status: uint8 = self.approvals[publisher][creative_id]
    assert status == STATUS_NONE or status == STATUS_REJECTED, "bad status"
    self.approvals[publisher][creative_id] = STATUS_REQUESTED
    log ApprovalRequested(publisher=publisher, creative_id=creative_id, advertiser=msg.sender)


@external
def set_approval(creative_id: uint256, approved: bool):
    """@notice APPROVE or REJECT a creative for msg.sender's slots. Reverts "no creative"."""
    self._require_creative(creative_id)
    status: uint8 = STATUS_APPROVED if approved else STATUS_REJECTED
    self.approvals[msg.sender][creative_id] = status
    log ApprovalSet(publisher=msg.sender, creative_id=creative_id, status=status)


@external
def revoke_approval(creative_id: uint256):
    """@notice Mark a creative REVOKED for msg.sender's slots (stops serving)."""
    self.approvals[msg.sender][creative_id] = STATUS_REVOKED
    log ApprovalSet(publisher=msg.sender, creative_id=creative_id, status=STATUS_REVOKED)


@external
def set_advertiser_allowed(advertiser: address, allowed: bool):
    """@notice Blanket-approve (or un-approve) an advertiser for msg.sender's slots."""
    self.allowed_advertisers[msg.sender][advertiser] = allowed
    log AdvertiserAllowed(publisher=msg.sender, advertiser=advertiser, allowed=allowed)


@external
def moderator_revoke(creative_id: uint256):
    """@notice Globally revoke a creative. Owner or moderator only. Reverts "not moderator"."""
    assert (msg.sender == ownable.owner) or (msg.sender == self.moderator), "not moderator"
    c: ICreativeRegistry.Creative = self._require_creative(creative_id)
    c.revoked = True
    self.creatives[creative_id] = c
    log CreativeRevoked(creative_id=creative_id, by=msg.sender)


@external
def set_moderator(moderator: address):
    """@notice Set the moderator address. Owner only."""
    ownable._check_owner()
    self.moderator = moderator
    log ModeratorSet(moderator=moderator)


@external
@view
def get_creative(creative_id: uint256) -> ICreativeRegistry.Creative:
    """@dev Reverts "no creative" for id == 0 or id >= next_id."""
    return self._require_creative(creative_id)


@external
@view
def is_active(creative_id: uint256) -> bool:
    return self._is_active(creative_id)


@external
@view
def is_blocked_for(publisher: address, creative_id: uint256) -> bool:
    return self._is_blocked_for(publisher, creative_id)


@external
@view
def is_approved_for(publisher: address, creative_id: uint256) -> bool:
    if not self._is_active(creative_id):
        return False
    if self._is_blocked_for(publisher, creative_id):
        return False
    c: ICreativeRegistry.Creative = self.creatives[creative_id]
    if self.approvals[publisher][creative_id] == STATUS_APPROVED:
        return True
    return self.allowed_advertisers[publisher][c.advertiser]


@external
@view
def approval_status(publisher: address, creative_id: uint256) -> uint8:
    return self.approvals[publisher][creative_id]


@external
@view
def is_advertiser_allowed(publisher: address, advertiser: address) -> bool:
    return self.allowed_advertisers[publisher][advertiser]
