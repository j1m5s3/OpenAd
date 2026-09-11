# pragma version ~=0.4.0
"""
@title AdSlot
@notice Permanent ERC-721 collection of ad slots: immutable SlotSpec, calendar, leases.
@dev    Semantics: docs/PROTOCOL.md §3.1, §4.1, §5.1, §6.
        snekmate erc721 is composed but `safe_mint` is not exported; minting is `mint_slot`.
        `tokenURI` is implemented here so `set_base_uri` can mutate the prefix (snekmate's
        `_BASE_URI` is immutable). ERC-4907 interface id is NOT advertised.
"""

from snekmate.auth import ownable
from snekmate.tokens import erc721
from interfaces import IAdSlot

implements: IAdSlot

initializes: ownable
initializes: erc721[ownable := ownable]

exports: (
    erc721.IERC721,
    erc721.totalSupply,
    erc721.tokenByIndex,
    erc721.tokenOfOwnerByIndex,
    erc721.name,
    erc721.symbol,
    ownable.owner,
    ownable.transfer_ownership,
    ownable.renounce_ownership,
)

event SlotMinted:
    slot_id: indexed(uint256)
    owner: indexed(address)
    width: uint16
    height: uint16
    kind: uint8
    domain: String[253]

event CalendarSet:
    slot_id: indexed(uint256)
    version: uint32
    period_seconds: uint64
    first_period_start: uint64

event LeaseSet:
    slot_id: indexed(uint256)
    period_index: indexed(uint256)
    user: indexed(address)
    version: uint32
    start: uint64
    end: uint64
    creative_id: uint256

event MarketSet:
    market: address

event BaseURISet:
    base_uri: String[80]

KIND_WEB_DISPLAY: constant(uint8) = 0
KIND_OTHER: constant(uint8) = 3
MIN_PERIOD_SECONDS: constant(uint64) = 3600

market: public(address)
base_uri: public(String[80])
specs: HashMap[uint256, IAdSlot.SlotSpec]
calendars: HashMap[uint256, IAdSlot.Calendar]
leases: HashMap[uint256, HashMap[uint32, HashMap[uint256, IAdSlot.Lease]]]
last_leased_end: HashMap[uint256, uint64]


@deploy
def __init__(name: String[25], symbol: String[5], initial_base_uri: String[80]):
    """
    @notice Deploy the slot collection. Platform owner is the deployer.
    @param name ERC-721 name (PROTOCOL: "OpenAd Slot").
    @param symbol ERC-721 symbol (PROTOCOL: "OASLT").
    @param initial_base_uri Metadata prefix; mutable via `set_base_uri`.
    """
    ownable.__init__()
    erc721.__init__(name, symbol, initial_base_uri, name, "1")
    self.base_uri = initial_base_uri


@internal
@view
def _period_window(slot_id: uint256, period_index: uint256) -> (uint64, uint64):
    cal: IAdSlot.Calendar = self.calendars[slot_id]
    assert cal.version != 0, "no calendar"
    start: uint256 = (
        convert(cal.first_period_start, uint256)
        + period_index * convert(cal.period_seconds, uint256)
    )
    end: uint256 = start + convert(cal.period_seconds, uint256)
    return convert(start, uint64), convert(end, uint64)


@internal
@view
def _current_period(slot_id: uint256) -> (bool, uint256):
    cal: IAdSlot.Calendar = self.calendars[slot_id]
    if cal.version == 0 or block.timestamp < convert(cal.first_period_start, uint256):
        return False, 0
    elapsed: uint256 = block.timestamp - convert(cal.first_period_start, uint256)
    return True, elapsed // convert(cal.period_seconds, uint256)


@external
def mint_slot(spec: IAdSlot.SlotSpec) -> uint256:
    """
    @notice Mint a new slot to msg.sender. Permissionless.
    @dev    Reverts "empty domain", "bad dimensions", "bad kind".
    @return The new slot_id.
    """
    assert len(spec.domain) > 0, "empty domain"
    assert spec.kind <= KIND_OTHER, "bad kind"
    if spec.kind == KIND_WEB_DISPLAY:
        assert spec.width > 0 and spec.height > 0, "bad dimensions"
    token_id: uint256 = erc721._counter + 1
    erc721._counter = token_id
    erc721._mint(msg.sender, token_id)
    self.specs[token_id] = spec
    log SlotMinted(
        slot_id=token_id,
        owner=msg.sender,
        width=spec.width,
        height=spec.height,
        kind=spec.kind,
        domain=spec.domain,
    )
    return token_id


@external
def set_calendar(slot_id: uint256, period_seconds: uint64, first_period_start: uint64):
    """
    @notice Replace the slot's calendar (bumps version). Slot owner only.
    @dev    Reverts "not owner", "period too short", "leases outstanding".
    """
    assert erc721._owner_of(slot_id) == msg.sender, "not owner"
    assert period_seconds >= MIN_PERIOD_SECONDS, "period too short"
    assert self.last_leased_end[slot_id] <= convert(block.timestamp, uint64), "leases outstanding"
    new_version: uint32 = self.calendars[slot_id].version + 1
    self.calendars[slot_id] = IAdSlot.Calendar(
        version=new_version,
        period_seconds=period_seconds,
        first_period_start=first_period_start,
    )
    log CalendarSet(
        slot_id=slot_id,
        version=new_version,
        period_seconds=period_seconds,
        first_period_start=first_period_start,
    )


@external
def set_lease(slot_id: uint256, period_index: uint256, user: address, creative_id: uint256):
    """
    @notice Write a lease for one period. Callable only by `market`.
    @dev    Reverts "not market", "no calendar", "period ended", "already leased", "bad lease".
    """
    assert msg.sender == self.market, "not market"
    cal: IAdSlot.Calendar = self.calendars[slot_id]
    assert cal.version != 0, "no calendar"
    start: uint64 = 0
    end: uint64 = 0
    start, end = self._period_window(slot_id, period_index)
    assert end > convert(block.timestamp, uint64), "period ended"
    assert user != empty(address) and creative_id != 0, "bad lease"
    existing: IAdSlot.Lease = self.leases[slot_id][cal.version][period_index]
    assert existing.user == empty(address), "already leased"
    self.leases[slot_id][cal.version][period_index] = IAdSlot.Lease(user=user, creative_id=creative_id)
    if end > self.last_leased_end[slot_id]:
        self.last_leased_end[slot_id] = end
    log LeaseSet(
        slot_id=slot_id,
        period_index=period_index,
        user=user,
        version=cal.version,
        start=start,
        end=end,
        creative_id=creative_id,
    )


@external
def set_market(market: address):
    """@notice Set the sole lease writer. Contract owner only."""
    ownable._check_owner()
    self.market = market
    log MarketSet(market=market)


@external
def set_base_uri(base_uri: String[80]):
    """@notice Set the metadata base URI (points at the API slot metadata route). Owner only."""
    ownable._check_owner()
    self.base_uri = base_uri
    log BaseURISet(base_uri=base_uri)


@external
@view
def tokenURI(token_id: uint256) -> String[512]:
    """@notice IERC721Metadata: base_uri concatenated with token id."""
    erc721._require_minted(token_id)
    return concat(self.base_uri, uint2str(token_id))


@external
@view
def spec_of(slot_id: uint256) -> IAdSlot.SlotSpec:
    return self.specs[slot_id]


@external
@view
def calendar_of(slot_id: uint256) -> IAdSlot.Calendar:
    return self.calendars[slot_id]


@external
@view
def last_leased_end_of(slot_id: uint256) -> uint64:
    return self.last_leased_end[slot_id]


@external
@view
def period_window(slot_id: uint256, period_index: uint256) -> (uint64, uint64):
    """@return (start, end) of the period under the current calendar. Reverts "no calendar"."""
    return self._period_window(slot_id, period_index)


@external
@view
def current_period(slot_id: uint256) -> (bool, uint256):
    """@return (exists, period_index) for block.timestamp under the current calendar."""
    return self._current_period(slot_id)


@external
@view
def lease_of(slot_id: uint256, period_index: uint256) -> IAdSlot.Lease:
    """@return The lease under the current calendar version (empty struct if none)."""
    version: uint32 = self.calendars[slot_id].version
    return self.leases[slot_id][version][period_index]


@external
@view
def userOf(tokenId: uint256) -> address:
    """@notice ERC-4907 read view: current period's lessee or empty(address)."""
    exists: bool = False
    idx: uint256 = 0
    exists, idx = self._current_period(tokenId)
    if not exists:
        return empty(address)
    version: uint32 = self.calendars[tokenId].version
    return self.leases[tokenId][version][idx].user


@external
@view
def userExpires(tokenId: uint256) -> uint256:
    """@notice ERC-4907 read view: current period's end if leased, else 0."""
    exists: bool = False
    idx: uint256 = 0
    exists, idx = self._current_period(tokenId)
    if not exists:
        return 0
    version: uint32 = self.calendars[tokenId].version
    lease: IAdSlot.Lease = self.leases[tokenId][version][idx]
    if lease.user == empty(address):
        return 0
    start: uint64 = 0
    end: uint64 = 0
    start, end = self._period_window(tokenId, idx)
    return convert(end, uint256)
