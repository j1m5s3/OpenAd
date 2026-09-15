# pragma version ~=0.4.0
# pragma nonreentrancy on
"""
@title CampaignVault
@notice CPC campaign escrow and batch settle. Semantics: docs/PROTOCOL.md §11. ADR-0014.
"""

from ethereum.ercs import IERC20
from snekmate.auth import ownable
from interfaces import ICampaignVault
from interfaces import IMarketplace

implements: ICampaignVault

initializes: ownable
exports: (ownable.owner, ownable.transfer_ownership, ownable.renounce_ownership)

struct SlotSpec:
    width: uint16
    height: uint16
    kind: uint8
    domain: String[253]

struct Creative:
    advertiser: address
    kind: uint8
    uri: String[512]
    content_hash: bytes32
    mime: String[64]
    width: uint16
    height: uint16
    click_url: String[512]
    nft_chain_id: uint64
    nft_contract: address
    nft_token_id: uint256
    nft_standard: uint8
    revoked: bool

interface AdSlotContract:
    def ownerOf(tokenId: uint256) -> address: view
    def spec_of(slot_id: uint256) -> SlotSpec: view

interface RegistryContract:
    def get_creative(creative_id: uint256) -> Creative: view
    def is_approved_for(publisher: address, creative_id: uint256) -> bool: view
    def is_active(creative_id: uint256) -> bool: view
    def is_blocked_for(publisher: address, creative_id: uint256) -> bool: view

interface MarketContract:
    def terms_of(slot_id: uint256) -> IMarketplace.Terms: view

event CampaignOpened:
    campaign_id: indexed(uint256)
    advertiser: indexed(address)
    slot_id: indexed(uint256)
    creative_id: uint256
    max_cpc: uint256
    budget: uint256
    valid_from: uint64
    valid_until: uint64

event CampaignToppedUp:
    campaign_id: indexed(uint256)
    amount: uint256
    remaining: uint256

event MaxCpcSet:
    campaign_id: indexed(uint256)
    max_cpc: uint256

event CampaignPausedSet:
    campaign_id: indexed(uint256)
    paused: bool

event CloseRequested:
    campaign_id: indexed(uint256)
    close_after: uint64

event CampaignFinalized:
    campaign_id: indexed(uint256)
    refund: uint256

event Settled:
    campaign_id: indexed(uint256)
    slot_id: uint256
    publisher: address
    payable_clicks: uint256
    charged: uint256
    fee: uint256
    batch_id: bytes32

event SettlerSet:
    settler: address

event VaultFeeSet:
    fee_bps: uint16

event VaultTreasurySet:
    treasury: address

event CloseDelaySet:
    seconds: uint64

event MaxBatchChargeSet:
    max_batch_charge: uint256

KIND_MEDIA: constant(uint8) = 0
APPROVAL_REQUIRED: constant(uint8) = 0
SALE_CPC: constant(uint8) = 1
MAX_FEE_BPS: constant(uint16) = 1000
BPS_DENOMINATOR: constant(uint256) = 10_000
MAX_CLOSE_DELAY: constant(uint64) = 604_800
DEFAULT_CLOSE_DELAY: constant(uint64) = 3600
DEFAULT_MAX_BATCH: constant(uint256) = 10_000_000_000

USDC: public(immutable(address))
AD_SLOT: public(immutable(address))
REGISTRY: public(immutable(address))
MARKETPLACE: public(immutable(address))

settler: public(address)
fee_bps: public(uint16)
treasury: public(address)
close_delay_seconds: public(uint64)
max_batch_charge: public(uint256)
campaign_count: public(uint256)
campaigns: HashMap[uint256, ICampaignVault.Campaign]
open_counts: HashMap[uint256, uint256]
used_batches: HashMap[bytes32, bool]


@deploy
def __init__(usdc: address, ad_slot: address, registry: address, marketplace: address):
    ownable.__init__()
    USDC = usdc
    AD_SLOT = ad_slot
    REGISTRY = registry
    MARKETPLACE = marketplace
    self.treasury = msg.sender
    self.close_delay_seconds = DEFAULT_CLOSE_DELAY
    self.max_batch_charge = DEFAULT_MAX_BATCH


@internal
def _try_permit(amount: uint256, deadline: uint256, v: uint8, r: bytes32, s: bytes32):
    data: Bytes[228] = abi_encode(
        msg.sender,
        self,
        amount,
        deadline,
        v,
        r,
        s,
        method_id=method_id("permit(address,address,uint256,uint256,uint8,bytes32,bytes32)"),
    )
    success: bool = False
    response: Bytes[32] = b""
    success, response = raw_call(USDC, data, max_outsize=32, revert_on_failure=False)


@internal
def _load(campaign_id: uint256) -> ICampaignVault.Campaign:
    assert campaign_id != 0 and campaign_id <= self.campaign_count, "no campaign"
    return self.campaigns[campaign_id]


@internal
def _open_campaign(
    slot_id: uint256,
    creative_id: uint256,
    max_cpc: uint256,
    budget: uint256,
    valid_from: uint64,
    valid_until: uint64,
) -> uint256:
    t: IMarketplace.Terms = staticcall MarketContract(MARKETPLACE).terms_of(slot_id)
    if t.sale_mode != SALE_CPC:
        if t.lead_seconds == 0:
            raise "no terms"
        raise "lease mode"
    assert not t.paused, "paused"
    assert max_cpc >= t.floor_cpc, "below floor"
    assert budget >= t.floor_cpc, "budget too small"
    if valid_until != 0:
        assert valid_until > valid_from, "bad window"
    publisher: address = staticcall AdSlotContract(AD_SLOT).ownerOf(slot_id)
    c: Creative = staticcall RegistryContract(REGISTRY).get_creative(creative_id)
    assert c.advertiser == msg.sender, "not creative owner"
    if c.kind == KIND_MEDIA:
        spec: SlotSpec = staticcall AdSlotContract(AD_SLOT).spec_of(slot_id)
        assert c.width == spec.width and c.height == spec.height, "dimension mismatch"
    if t.approval_mode == APPROVAL_REQUIRED:
        assert staticcall RegistryContract(REGISTRY).is_approved_for(publisher, creative_id), "not approved"
    else:
        active: bool = staticcall RegistryContract(REGISTRY).is_active(creative_id)
        blocked: bool = staticcall RegistryContract(REGISTRY).is_blocked_for(publisher, creative_id)
        assert active and not blocked, "creative blocked"
    extcall IERC20(USDC).transferFrom(msg.sender, self, budget, default_return_value=True)
    cid: uint256 = self.campaign_count + 1
    self.campaign_count = cid
    self.campaigns[cid] = ICampaignVault.Campaign(
        advertiser=msg.sender,
        slot_id=slot_id,
        creative_id=creative_id,
        max_cpc=max_cpc,
        remaining=budget,
        valid_from=valid_from,
        valid_until=valid_until,
        paused=False,
        close_after=0,
        closed=False,
    )
    self.open_counts[slot_id] = self.open_counts[slot_id] + 1
    log CampaignOpened(
        campaign_id=cid,
        advertiser=msg.sender,
        slot_id=slot_id,
        creative_id=creative_id,
        max_cpc=max_cpc,
        budget=budget,
        valid_from=valid_from,
        valid_until=valid_until,
    )
    return cid


@external
def open_campaign(
    slot_id: uint256,
    creative_id: uint256,
    max_cpc: uint256,
    budget: uint256,
    valid_from: uint64,
    valid_until: uint64,
) -> uint256:
    """
    @notice Escrow `budget` USDC and open a CPC campaign on `slot_id`.
    @dev    Reverts "no terms", "lease mode", "paused", "below floor", "budget too small",
            "bad window", then Marketplace.buy creative strings.
    """
    return self._open_campaign(slot_id, creative_id, max_cpc, budget, valid_from, valid_until)


@external
def open_campaign_with_permit(
    slot_id: uint256,
    creative_id: uint256,
    max_cpc: uint256,
    budget: uint256,
    valid_from: uint64,
    valid_until: uint64,
    deadline: uint256,
    v: uint8,
    r: bytes32,
    s: bytes32,
) -> uint256:
    """@notice As `open_campaign`, preceded by a NON-REVERTING EIP-2612 permit for `budget`."""
    self._try_permit(budget, deadline, v, r, s)
    return self._open_campaign(slot_id, creative_id, max_cpc, budget, valid_from, valid_until)


@internal
def _top_up(campaign_id: uint256, amount: uint256):
    camp: ICampaignVault.Campaign = self._load(campaign_id)
    assert camp.advertiser == msg.sender, "not advertiser"
    assert not camp.closed, "closed"
    assert amount > 0, "bad amount"
    extcall IERC20(USDC).transferFrom(msg.sender, self, amount, default_return_value=True)
    new_rem: uint256 = camp.remaining + amount
    self.campaigns[campaign_id].remaining = new_rem
    log CampaignToppedUp(campaign_id=campaign_id, amount=amount, remaining=new_rem)


@external
def top_up(campaign_id: uint256, amount: uint256):
    """@notice Add USDC to an open campaign. Reverts "not advertiser", "closed", "bad amount"."""
    self._top_up(campaign_id, amount)


@external
def top_up_with_permit(
    campaign_id: uint256,
    amount: uint256,
    deadline: uint256,
    v: uint8,
    r: bytes32,
    s: bytes32,
):
    """@notice As `top_up`, preceded by a NON-REVERTING EIP-2612 permit for `amount`."""
    self._try_permit(amount, deadline, v, r, s)
    self._top_up(campaign_id, amount)


@external
def set_max_cpc(campaign_id: uint256, max_cpc: uint256):
    """@notice Update max CPC. Reverts "not advertiser", "closed", "below floor"."""
    camp: ICampaignVault.Campaign = self._load(campaign_id)
    assert camp.advertiser == msg.sender, "not advertiser"
    assert not camp.closed, "closed"
    t: IMarketplace.Terms = staticcall MarketContract(MARKETPLACE).terms_of(camp.slot_id)
    assert max_cpc >= t.floor_cpc, "below floor"
    self.campaigns[campaign_id].max_cpc = max_cpc
    log MaxCpcSet(campaign_id=campaign_id, max_cpc=max_cpc)


@external
def set_paused(campaign_id: uint256, paused: bool):
    """@notice Pause or unpause a campaign. Reverts "not advertiser", "closed"."""
    camp: ICampaignVault.Campaign = self._load(campaign_id)
    assert camp.advertiser == msg.sender, "not advertiser"
    assert not camp.closed, "closed"
    self.campaigns[campaign_id].paused = paused
    log CampaignPausedSet(campaign_id=campaign_id, paused=paused)


@external
def request_close(campaign_id: uint256):
    """@notice Start CLOSE_DELAY. Reverts "not advertiser", "closed", "closing"."""
    camp: ICampaignVault.Campaign = self._load(campaign_id)
    assert camp.advertiser == msg.sender, "not advertiser"
    assert not camp.closed, "closed"
    assert camp.close_after == 0, "closing"
    close_after: uint64 = convert(block.timestamp + convert(self.close_delay_seconds, uint256), uint64)
    self.campaigns[campaign_id].close_after = close_after
    log CloseRequested(campaign_id=campaign_id, close_after=close_after)


@external
def finalize_close(campaign_id: uint256):
    """@notice Refund remaining after close_after. Anyone. Reverts "not closing", "too early", "closed"."""
    camp: ICampaignVault.Campaign = self._load(campaign_id)
    assert not camp.closed, "closed"
    assert camp.close_after != 0, "not closing"
    assert block.timestamp >= convert(camp.close_after, uint256), "too early"
    refund: uint256 = camp.remaining
    self.campaigns[campaign_id].remaining = 0
    self.campaigns[campaign_id].closed = True
    self.open_counts[camp.slot_id] = self.open_counts[camp.slot_id] - 1
    if refund > 0:
        extcall IERC20(USDC).transfer(camp.advertiser, refund, default_return_value=True)
    log CampaignFinalized(campaign_id=campaign_id, refund=refund)


@external
def settle_batch(
    campaign_id: uint256,
    payable_clicks: uint256,
    charged_usdc: uint256,
    batch_id: bytes32,
):
    """
    @notice Pay fee to treasury and rest to current slot owner; decrement remaining.
    @dev    Reverts "not settler", "closed", "batch used", "bad charge".
    """
    assert msg.sender == self.settler, "not settler"
    camp: ICampaignVault.Campaign = self._load(campaign_id)
    assert not camp.closed, "closed"
    assert not self.used_batches[batch_id], "batch used"
    assert charged_usdc > 0 and charged_usdc <= camp.remaining and charged_usdc <= self.max_batch_charge, "bad charge"
    assert payable_clicks > 0, "bad charge"
    self.used_batches[batch_id] = True
    new_rem: uint256 = camp.remaining - charged_usdc
    self.campaigns[campaign_id].remaining = new_rem
    fee: uint256 = charged_usdc * convert(self.fee_bps, uint256) // BPS_DENOMINATOR
    publisher: address = staticcall AdSlotContract(AD_SLOT).ownerOf(camp.slot_id)
    if fee > 0:
        extcall IERC20(USDC).transfer(self.treasury, fee, default_return_value=True)
    rest: uint256 = charged_usdc - fee
    if rest > 0:
        extcall IERC20(USDC).transfer(publisher, rest, default_return_value=True)
    log Settled(
        campaign_id=campaign_id,
        slot_id=camp.slot_id,
        publisher=publisher,
        payable_clicks=payable_clicks,
        charged=charged_usdc,
        fee=fee,
        batch_id=batch_id,
    )


@external
def set_settler(settler: address):
    """@notice Owner. Reverts "bad settler" if empty."""
    ownable._check_owner()
    assert settler != empty(address), "bad settler"
    self.settler = settler
    log SettlerSet(settler=settler)


@external
def set_fee_bps(fee_bps: uint16):
    """@notice Owner. Reverts "fee too high" if > 1000."""
    ownable._check_owner()
    assert fee_bps <= MAX_FEE_BPS, "fee too high"
    self.fee_bps = fee_bps
    log VaultFeeSet(fee_bps=fee_bps)


@external
def set_treasury(treasury: address):
    """@notice Owner. Reverts "bad treasury" if empty."""
    ownable._check_owner()
    assert treasury != empty(address), "bad treasury"
    self.treasury = treasury
    log VaultTreasurySet(treasury=treasury)


@external
def set_close_delay(seconds: uint64):
    """@notice Owner. Reverts "bad delay" if 0 or > 604800."""
    ownable._check_owner()
    assert seconds != 0 and seconds <= MAX_CLOSE_DELAY, "bad delay"
    self.close_delay_seconds = seconds
    log CloseDelaySet(seconds=seconds)


@external
def set_max_batch_charge(max_batch_charge: uint256):
    """@notice Owner. Reverts "bad charge" if 0."""
    ownable._check_owner()
    assert max_batch_charge != 0, "bad charge"
    self.max_batch_charge = max_batch_charge
    log MaxBatchChargeSet(max_batch_charge=max_batch_charge)


@external
@view
def campaign_of(campaign_id: uint256) -> ICampaignVault.Campaign:
    assert campaign_id != 0 and campaign_id <= self.campaign_count, "no campaign"
    return self.campaigns[campaign_id]


@external
@view
def open_campaigns_of(slot_id: uint256) -> uint256:
    return self.open_counts[slot_id]


@external
@view
def used_batch(batch_id: bytes32) -> bool:
    return self.used_batches[batch_id]
