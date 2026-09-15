"""Decoded event envelope and the canonical list of protocol events (PROTOCOL.md section 6).

``EXPECTED_EVENTS`` is the contract between the spec and ``handlers.py``: a test asserts that
every entry has exactly one registered handler.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class DecodedEvent:
    contract: str  # "AdSlot" | "Marketplace" | "CreativeRegistry" | "CampaignVault"
    name: str
    args: dict[str, Any]
    block_number: int
    block_hash: str
    tx_hash: str
    log_index: int

    @property
    def key(self) -> tuple[str, str]:
        return (self.contract, self.name)


EXPECTED_EVENTS: frozenset[tuple[str, str]] = frozenset(
    {
        ("AdSlot", "SlotMinted"),
        ("AdSlot", "CalendarSet"),
        ("AdSlot", "LeaseSet"),
        ("AdSlot", "MarketSet"),
        ("AdSlot", "BaseURISet"),
        ("AdSlot", "Transfer"),
        ("Marketplace", "TermsSet"),
        ("Marketplace", "CampaignVaultSet"),
        ("Marketplace", "PausedSet"),
        ("Marketplace", "Purchased"),
        ("Marketplace", "FeeSet"),
        ("Marketplace", "TreasurySet"),
        ("CampaignVault", "CampaignOpened"),
        ("CampaignVault", "CampaignToppedUp"),
        ("CampaignVault", "MaxCpcSet"),
        ("CampaignVault", "CampaignPausedSet"),
        ("CampaignVault", "CloseRequested"),
        ("CampaignVault", "CampaignFinalized"),
        ("CampaignVault", "Settled"),
        ("CampaignVault", "SettlerSet"),
        ("CampaignVault", "VaultFeeSet"),
        ("CampaignVault", "VaultTreasurySet"),
        ("CampaignVault", "CloseDelaySet"),
        ("CampaignVault", "MaxBatchChargeSet"),
        ("CreativeRegistry", "CreativeRegistered"),
        ("CreativeRegistry", "NftCreativeRegistered"),
        ("CreativeRegistry", "ApprovalRequested"),
        ("CreativeRegistry", "ApprovalSet"),
        ("CreativeRegistry", "AdvertiserAllowed"),
        ("CreativeRegistry", "CreativeRevoked"),
        ("CreativeRegistry", "ModeratorSet"),
    }
)
