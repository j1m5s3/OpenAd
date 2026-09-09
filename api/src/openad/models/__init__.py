"""SQLAlchemy models. Import this package to register every table on ``Base.metadata``.

Chain-derived tables (rebuildable from events): Slot, Terms, Lease, Creative, Approval,
AllowedAdvertiser, ProtocolConfig, IndexerCursor.
Off-chain-only tables: HouseAd, DomainVerification, CreativeVerification, ServeEvent.
See docs/ARCHITECTURE.md section 3.2.
"""

from openad.models.creative import AllowedAdvertiser, Approval, Creative
from openad.models.indexer import IndexerCursor, ProtocolConfig
from openad.models.offchain import CreativeVerification, DomainVerification, HouseAd, ServeEvent
from openad.models.slot import Lease, Slot, Terms

__all__ = [
    "AllowedAdvertiser",
    "Approval",
    "Creative",
    "CreativeVerification",
    "DomainVerification",
    "HouseAd",
    "IndexerCursor",
    "Lease",
    "ProtocolConfig",
    "ServeEvent",
    "Slot",
    "Terms",
]
