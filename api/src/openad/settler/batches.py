"""Settler batch planning. Pure functions; the process signs txs in ``runner.py``."""

from __future__ import annotations

from dataclasses import dataclass

from eth_hash.auto import keccak

from openad.models.offchain import ClickEvent


@dataclass(frozen=True)
class PlannedBatch:
    campaign_id: int
    click_ids: tuple[int, ...]
    payable_clicks: int
    charged: int
    batch_id: bytes


def plan_batches(
    clicks: list[ClickEvent],
    *,
    remaining_of: dict[int, int],
    max_batch_charge: int,
) -> list[PlannedBatch]:
    """Group unpaid payable clicks by campaign; never exceed remaining or max_batch_charge."""
    by_camp: dict[int, list[ClickEvent]] = {}
    for row in sorted(clicks, key=lambda c: c.id):
        by_camp.setdefault(row.campaign_id, []).append(row)
    out: list[PlannedBatch] = []
    for campaign_id, rows in by_camp.items():
        remaining = remaining_of.get(campaign_id, 0)
        ids: list[int] = []
        charged = 0
        for row in rows:
            nxt = charged + row.gsp_cpc
            if row.gsp_cpc <= 0 or nxt > remaining or nxt > max_batch_charge:
                break
            ids.append(row.id)
            charged = nxt
        if charged <= 0 or not ids:
            continue
        digest = keccak(
            campaign_id.to_bytes(32, "big")
            + ids[0].to_bytes(32, "big")
            + ids[-1].to_bytes(32, "big")
        )
        out.append(
            PlannedBatch(
                campaign_id=campaign_id,
                click_ids=tuple(ids),
                payable_clicks=len(ids),
                charged=charged,
                batch_id=digest,
            )
        )
    return out
