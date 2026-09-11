# pragma version ~=0.4.0
# pragma nonreentrancy on
"""
@title Marketplace
@notice Per-slot sale Terms, Dutch pricing, atomic buy (USDC fee split + lease write).
@dev    Semantics: docs/PROTOCOL.md §3.2, §4.2, §4.3, §5.2 (check order), §6. ADR-0004.
"""

from ethereum.ercs import IERC20
from snekmate.auth import ownable
from interfaces import IMarketplace

implements: IMarketplace

initializes: ownable
exports: (ownable.owner, ownable.transfer_ownership, ownable.renounce_ownership)

struct SlotSpec:
    width: uint16
    height: uint16
    kind: uint8
    domain: String[253]

struct Calendar:
    version: uint32
    period_seconds: uint64
    first_period_start: uint64

struct Lease:
    user: address
    creative_id: uint256

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
    def period_window(slot_id: uint256, period_index: uint256) -> (uint64, uint64): view
    def spec_of(slot_id: uint256) -> SlotSpec: view
    def lease_of(slot_id: uint256, period_index: uint256) -> Lease: view
    def calendar_of(slot_id: uint256) -> Calendar: view
    def set_lease(slot_id: uint256, period_index: uint256, user: address, creative_id: uint256): nonpayable

interface RegistryContract:
    def get_creative(creative_id: uint256) -> Creative: view
    def is_approved_for(publisher: address, creative_id: uint256) -> bool: view
    def is_active(creative_id: uint256) -> bool: view
    def is_blocked_for(publisher: address, creative_id: uint256) -> bool: view

event TermsSet:
    slot_id: indexed(uint256)
    start_price: uint256
    floor_price: uint256
    lead_seconds: uint64
    sale_end: uint64
    approval_mode: uint8

event PausedSet:
    slot_id: indexed(uint256)
    paused: bool

event Purchased:
    slot_id: indexed(uint256)
    period_index: indexed(uint256)
    buyer: indexed(address)
    publisher: address
    creative_id: uint256
    price: uint256
    fee: uint256
    approval_mode: uint8
    start: uint64
    end: uint64

event FeeSet:
    fee_bps: uint16

event TreasurySet:
    treasury: address

KIND_MEDIA: constant(uint8) = 0
APPROVAL_REQUIRED: constant(uint8) = 0
APPROVAL_WAIVED: constant(uint8) = 1
MAX_FEE_BPS: constant(uint16) = 1000
BPS_DENOMINATOR: constant(uint256) = 10_000

USDC: public(immutable(address))
AD_SLOT: public(immutable(address))
REGISTRY: public(immutable(address))
fee_bps: public(uint16)
treasury: public(address)
terms: HashMap[uint256, IMarketplace.Terms]


@deploy
def __init__(usdc: address, ad_slot: address, registry: address):
    """@notice Wire immutables. Fee/treasury are set by the owner after deploy."""
    ownable.__init__()
    USDC = usdc
    AD_SLOT = ad_slot
    REGISTRY = registry
    self.treasury = msg.sender


@internal
@view
def _open_at(start: uint64, lead_seconds: uint64) -> uint64:
    start_u: uint256 = convert(start, uint256)
    lead_u: uint256 = convert(lead_seconds, uint256)
    if start_u > lead_u:
        return convert(start_u - lead_u, uint64)
    return 0


@internal
@view
def _dutch_price(terms: IMarketplace.Terms, start: uint64, end: uint64) -> uint256:
    """Revert "not open" / "closed"; Dutch while now < start, remainder until end."""
    open_at: uint64 = self._open_at(start, terms.lead_seconds)
    now: uint256 = block.timestamp
    start_u: uint256 = convert(start, uint256)
    end_u: uint256 = convert(end, uint256)
    open_u: uint256 = convert(open_at, uint256)
    assert now >= open_u, "not open"
    assert now < end_u, "closed"
    if now < start_u:
        duration: uint256 = start_u - open_u
        delta: uint256 = terms.start_price - terms.floor_price
        remaining: uint256 = start_u - now
        return terms.floor_price + delta * remaining // duration
    period: uint256 = end_u - start_u
    return terms.floor_price * (end_u - now) // period


@internal
@view
def _fee(price: uint256) -> uint256:
    return price * convert(self.fee_bps, uint256) // BPS_DENOMINATOR


@external
def set_terms(
    slot_id: uint256,
    start_price: uint256,
    floor_price: uint256,
    lead_seconds: uint64,
    sale_end: uint64,
    approval_mode: uint8,
):
    """
    @notice Set sale terms for a slot. Slot owner only. `paused` is left unchanged.
    @dev    Reverts "not owner", "bad prices", "bad lead", "bad mode".
    """
    publisher: address = staticcall AdSlotContract(AD_SLOT).ownerOf(slot_id)
    assert publisher == msg.sender, "not owner"
    assert start_price >= floor_price, "bad prices"
    assert lead_seconds > 0, "bad lead"
    assert approval_mode <= APPROVAL_WAIVED, "bad mode"
    paused: bool = self.terms[slot_id].paused
    self.terms[slot_id] = IMarketplace.Terms(
        start_price=start_price,
        floor_price=floor_price,
        lead_seconds=lead_seconds,
        sale_end=sale_end,
        approval_mode=approval_mode,
        paused=paused,
    )
    log TermsSet(
        slot_id=slot_id,
        start_price=start_price,
        floor_price=floor_price,
        lead_seconds=lead_seconds,
        sale_end=sale_end,
        approval_mode=approval_mode,
    )


@external
def set_paused(slot_id: uint256, paused: bool):
    """@notice Pause/unpause sales for a slot. Slot owner only. Reverts "not owner"."""
    publisher: address = staticcall AdSlotContract(AD_SLOT).ownerOf(slot_id)
    assert publisher == msg.sender, "not owner"
    self.terms[slot_id].paused = paused
    log PausedSet(slot_id=slot_id, paused=paused)


@external
def buy(slot_id: uint256, period_index: uint256, creative_id: uint256, max_price: uint256):
    """
    @notice Buy one period at the current Dutch price with a pre-approved USDC allowance.
    @dev    Check order (PROTOCOL §5.2) is normative.
    """
    self._buy(slot_id, period_index, creative_id, max_price)


@external
def buy_with_permit(
    slot_id: uint256,
    period_index: uint256,
    creative_id: uint256,
    max_price: uint256,
    deadline: uint256,
    v: uint8,
    r: bytes32,
    s: bytes32,
):
    """
    @notice As `buy`, preceded by a NON-REVERTING EIP-2612 permit for `max_price`
            (ADR-0004). A failed permit is ignored; transferFrom enforces allowance.
    """
    data: Bytes[228] = abi_encode(
        msg.sender,
        self,
        max_price,
        deadline,
        v,
        r,
        s,
        method_id=method_id("permit(address,address,uint256,uint256,uint8,bytes32,bytes32)"),
    )
    success: bool = False
    response: Bytes[32] = b""
    success, response = raw_call(USDC, data, max_outsize=32, revert_on_failure=False)
    self._buy(slot_id, period_index, creative_id, max_price)


@internal
def _buy(slot_id: uint256, period_index: uint256, creative_id: uint256, max_price: uint256):
    t: IMarketplace.Terms = self.terms[slot_id]
    assert t.lead_seconds > 0, "no terms"
    assert not t.paused, "paused"
    start: uint64 = 0
    end: uint64 = 0
    start, end = staticcall AdSlotContract(AD_SLOT).period_window(slot_id, period_index)
    if t.sale_end != 0:
        assert end <= t.sale_end, "beyond sale end"
    p: uint256 = self._dutch_price(t, start, end)
    assert p <= max_price, "price exceeds max"
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
    extcall AdSlotContract(AD_SLOT).set_lease(slot_id, period_index, msg.sender, creative_id)
    fee: uint256 = self._fee(p)
    publisher_amount: uint256 = p - fee
    if fee > 0:
        extcall IERC20(USDC).transferFrom(msg.sender, self.treasury, fee, default_return_value=True)
    if publisher_amount > 0:
        extcall IERC20(USDC).transferFrom(msg.sender, publisher, publisher_amount, default_return_value=True)
    log Purchased(
        slot_id=slot_id,
        period_index=period_index,
        buyer=msg.sender,
        publisher=publisher,
        creative_id=creative_id,
        price=p,
        fee=fee,
        approval_mode=t.approval_mode,
        start=start,
        end=end,
    )


@external
def set_fee_bps(fee_bps: uint16):
    """@notice Set protocol fee. Owner only. Reverts "fee too high" if > 1000."""
    ownable._check_owner()
    assert fee_bps <= MAX_FEE_BPS, "fee too high"
    self.fee_bps = fee_bps
    log FeeSet(fee_bps=fee_bps)


@external
def set_treasury(treasury: address):
    """@notice Set fee recipient. Owner only. Reverts "bad treasury" if empty."""
    ownable._check_owner()
    assert treasury != empty(address), "bad treasury"
    self.treasury = treasury
    log TreasurySet(treasury=treasury)


@external
@view
def terms_of(slot_id: uint256) -> IMarketplace.Terms:
    return self.terms[slot_id]


@external
@view
def price(slot_id: uint256, period_index: uint256) -> uint256:
    """@notice Current Dutch or remainder price. Reverts "no terms", "not open", "closed"."""
    t: IMarketplace.Terms = self.terms[slot_id]
    assert t.lead_seconds > 0, "no terms"
    start: uint64 = 0
    end: uint64 = 0
    start, end = staticcall AdSlotContract(AD_SLOT).period_window(slot_id, period_index)
    return self._dutch_price(t, start, end)


@external
@view
def quote(slot_id: uint256, period_index: uint256) -> IMarketplace.Quote:
    """@notice Non-reverting helper for UIs; mirrors the checks of `buy` up to pricing."""
    empty_q: IMarketplace.Quote = IMarketplace.Quote(
        sellable=False,
        reason="",
        price=0,
        fee=0,
        open_at=0,
        start=0,
        end=0,
    )
    t: IMarketplace.Terms = self.terms[slot_id]
    if t.lead_seconds == 0:
        empty_q.reason = "no terms"
        return empty_q
    if t.paused:
        empty_q.reason = "paused"
        return empty_q
    cal: Calendar = staticcall AdSlotContract(AD_SLOT).calendar_of(slot_id)
    if cal.version == 0:
        empty_q.reason = "no calendar"
        return empty_q
    start: uint64 = 0
    end: uint64 = 0
    start, end = staticcall AdSlotContract(AD_SLOT).period_window(slot_id, period_index)
    empty_q.start = start
    empty_q.end = end
    empty_q.open_at = self._open_at(start, t.lead_seconds)
    if t.sale_end != 0 and end > t.sale_end:
        empty_q.reason = "beyond sale end"
        return empty_q
    now: uint256 = block.timestamp
    if now < convert(empty_q.open_at, uint256):
        empty_q.reason = "not open"
        return empty_q
    if now >= convert(end, uint256):
        empty_q.reason = "closed"
        return empty_q
    lease: Lease = staticcall AdSlotContract(AD_SLOT).lease_of(slot_id, period_index)
    if lease.user != empty(address):
        empty_q.reason = "already leased"
        return empty_q
    p: uint256 = self._dutch_price(t, start, end)
    empty_q.price = p
    empty_q.fee = self._fee(p)
    empty_q.sellable = True
    empty_q.reason = ""
    return empty_q
