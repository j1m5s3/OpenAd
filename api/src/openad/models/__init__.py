"""SQLAlchemy models. Import this package to register every table on ``Base.metadata``.

Chain-derived tables (rebuildable from events): Slot, Terms, Lease, Creative, Approval,
AllowedAdvertiser, ProtocolConfig, IndexerCursor, Campaign, CampaignSettlement.
Off-chain-only tables: HouseAd, DomainVerification, CreativeVerification, ServeEvent,
ClickEvent, AuthNonce, Session.
See docs/ARCHITECTURE.md section 3.2.
"""

from openad.models.auth import AuthNonce, Session
from openad.models.campaign import Campaign, CampaignSettlement
from openad.models.creative import AllowedAdvertiser, Approval, Creative
from openad.models.indexer import IndexerCursor, ProtocolConfig
from openad.models.offchain import (
    ClickEvent,
    CreativeVerification,
    DomainVerification,
    HouseAd,
    ServeEvent,
)
from openad.models.slot import Lease, Slot, Terms

__all__ = [
    "AllowedAdvertiser",
    "Approval",
    "AuthNonce",
    "Campaign",
    "CampaignSettlement",
    "ClickEvent",
    "Creative",
    "CreativeVerification",
    "DomainVerification",
    "HouseAd",
    "IndexerCursor",
    "Lease",
    "ProtocolConfig",
    "ServeEvent",
    "Session",
    "Slot",
    "Terms",
]
