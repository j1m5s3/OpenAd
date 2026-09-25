"""Slot listings (ROADMAP 6.3, step 16): owner-only writes, text/category validation, the
round trip through ``GET /v1/slots/{id}``, the category filter (including the LIKE prefix
trap), and DELETE."""

from __future__ import annotations

from datetime import UTC, datetime

from eth_account import Account
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from openad.models import SlotListing
from openad.services.offchain import _looks_like_url
from tests.conftest import make_slot
from tests.siwe_helpers import sign_in


async def _seed_slot(session: AsyncSession, *, owner: str, slot_id: int = 1) -> None:
    session.add(make_slot(slot_id=slot_id, owner=owner))
    await session.commit()


async def test_put_requires_a_session(client: AsyncClient, session: AsyncSession) -> None:
    await _seed_slot(session, owner="0x" + "aa" * 20)
    res = await client.put(
        "/v1/slots/1/listing",
        json={"summary": "Weekly crypto digest", "audience": "Solidity devs", "categories": []},
    )
    assert res.status_code == 401


async def test_put_forbidden_for_non_owner(client: AsyncClient, session: AsyncSession) -> None:
    owner = Account.create()
    other = Account.create()
    await _seed_slot(session, owner=owner.address.lower())
    await sign_in(client, other)
    res = await client.put(
        "/v1/slots/1/listing",
        json={"summary": "Weekly crypto digest", "audience": "Solidity devs", "categories": []},
    )
    assert res.status_code == 403


async def test_put_round_trips_through_get_slot(client: AsyncClient, session: AsyncSession) -> None:
    owner = Account.create()
    await _seed_slot(session, owner=owner.address.lower())
    await sign_in(client, owner)
    put = await client.put(
        "/v1/slots/1/listing",
        json={
            "summary": "Weekly crypto market recap, 40k opens",
            "audience": "Solidity developers reading our weekly security digest",
            "categories": ["Security", "defi", "security"],
        },
    )
    assert put.status_code == 200
    body = put.json()
    assert body["summary"] == "Weekly crypto market recap, 40k opens"
    assert body["categories"] == ["defi", "security"]  # deduped, sorted, lower-cased

    got = await client.get("/v1/slots/1")
    assert got.status_code == 200
    listing = got.json()["listing"]
    assert listing is not None
    assert listing["summary"] == "Weekly crypto market recap, 40k opens"
    assert listing["categories"] == ["defi", "security"]
    assert isinstance(listing["updatedAt"], int)


async def test_put_collapses_whitespace(client: AsyncClient, session: AsyncSession) -> None:
    owner = Account.create()
    await _seed_slot(session, owner=owner.address.lower())
    await sign_in(client, owner)
    put = await client.put(
        "/v1/slots/1/listing",
        json={"summary": "  Weekly   digest\n\tfor devs  ", "audience": "devs", "categories": []},
    )
    assert put.status_code == 200
    assert put.json()["summary"] == "Weekly digest for devs"


async def test_put_rejects_unknown_category(client: AsyncClient, session: AsyncSession) -> None:
    owner = Account.create()
    await _seed_slot(session, owner=owner.address.lower())
    await sign_in(client, owner)
    res = await client.put(
        "/v1/slots/1/listing",
        json={"summary": "x", "audience": "y", "categories": ["not-a-real-category"]},
    )
    assert res.status_code == 422
    assert res.json()["error"] == "invalid_listing"


async def test_put_rejects_more_than_three_categories(
    client: AsyncClient, session: AsyncSession
) -> None:
    owner = Account.create()
    await _seed_slot(session, owner=owner.address.lower())
    await sign_in(client, owner)
    res = await client.put(
        "/v1/slots/1/listing",
        json={
            "summary": "x",
            "audience": "y",
            "categories": ["defi", "nft", "gaming", "security"],
        },
    )
    assert res.status_code == 422
    assert res.json()["error"] == "invalid_listing"


async def test_put_dedupes_categories_before_checking_the_cap(
    client: AsyncClient, session: AsyncSession
) -> None:
    """4 raw entries that collapse to 2 distinct, valid categories must not be rejected as "too
    many": the cap applies after de-duplication, not before."""
    owner = Account.create()
    await _seed_slot(session, owner=owner.address.lower())
    await sign_in(client, owner)
    res = await client.put(
        "/v1/slots/1/listing",
        json={"summary": "x", "audience": "y", "categories": ["defi", "defi", "DeFi", "security"]},
    )
    assert res.status_code == 200
    assert res.json()["categories"] == ["defi", "security"]


async def test_put_rejects_overlong_summary(client: AsyncClient, session: AsyncSession) -> None:
    owner = Account.create()
    await _seed_slot(session, owner=owner.address.lower())
    await sign_in(client, owner)
    res = await client.put(
        "/v1/slots/1/listing",
        json={"summary": "x" * 141, "audience": "y", "categories": []},
    )
    assert res.status_code == 422
    assert res.json()["error"] == "invalid_listing"


async def test_put_rejects_overlong_audience(client: AsyncClient, session: AsyncSession) -> None:
    owner = Account.create()
    await _seed_slot(session, owner=owner.address.lower())
    await sign_in(client, owner)
    res = await client.put(
        "/v1/slots/1/listing",
        json={"summary": "x", "audience": "y" * 601, "categories": []},
    )
    assert res.status_code == 422
    assert res.json()["error"] == "invalid_listing"


async def test_put_rejects_url_in_summary(client: AsyncClient, session: AsyncSession) -> None:
    owner = Account.create()
    await _seed_slot(session, owner=owner.address.lower())
    await sign_in(client, owner)
    for summary in ["Visit https://example.com for more", "Deals at example.com this week"]:
        res = await client.put(
            "/v1/slots/1/listing",
            json={"summary": summary, "audience": "y", "categories": []},
        )
        assert res.status_code == 422, summary
        assert res.json()["error"] == "invalid_listing"


async def test_put_rejects_url_with_fullwidth_or_ideographic_dot(
    client: AsyncClient, session: AsyncSession
) -> None:
    """NFKC folds the fullwidth full stop (U+FF0E) to ASCII '.'; the ideographic full stop
    (U+3002) and halfwidth ideographic full stop (U+FF61) have no NFKC decomposition to '.', so
    they are folded explicitly before the URL check runs."""
    for slot_id, summary in enumerate(
        ["Deals at example\uff0ecom this week", "Deals at example\u3002com this week"], start=1
    ):
        owner = Account.create()
        await _seed_slot(session, owner=owner.address.lower(), slot_id=slot_id)
        await sign_in(client, owner)
        res = await client.put(
            f"/v1/slots/{slot_id}/listing",
            json={"summary": summary, "audience": "y", "categories": []},
        )
        assert res.status_code == 422, summary
        assert res.json()["error"] == "invalid_listing"
        await client.post("/v1/auth/logout")


async def test_put_allows_common_tech_tokens_in_summary(
    client: AsyncClient, session: AsyncSession
) -> None:
    """These read as a bare "domain" (label + dot + short suffix) but are not links."""
    owner = Account.create()
    await _seed_slot(session, owner=owner.address.lower())
    await sign_in(client, owner)
    for summary in [
        "Node.js devs read our newsletter",
        "ethers.js users, mostly",
        "We review audit.sol reports every week",
    ]:
        res = await client.put(
            "/v1/slots/1/listing",
            json={"summary": summary, "audience": "y", "categories": []},
        )
        assert res.status_code == 200, (summary, res.json())


async def test_put_rejects_zwj_split_and_non_allowlisted_cctld_hosts(
    client: AsyncClient, session: AsyncSession
) -> None:
    """ZWJ (U+200D) is allowed in listing text but must not split a host past the URL check, and
    ccTLDs that look like file extensions (`.rs` Serbia, `.py` Paraguay) are not allowlisted."""
    owner = Account.create()
    await _seed_slot(session, owner=owner.address.lower())
    await sign_in(client, owner)
    for summary in [
        "Deals at evil\u200d.com",
        "Deals at evil.\u200dcom",
        "buy at evil.rs",
        "shop.com.py",
    ]:
        res = await client.put(
            "/v1/slots/1/listing",
            json={"summary": summary, "audience": "y", "categories": []},
        )
        assert res.status_code == 422, repr(summary)
        assert res.json()["error"] == "invalid_listing"


def test_looks_like_url_zwj_and_suffix_allowlist() -> None:
    assert _looks_like_url("evil\u200d.com")
    assert _looks_like_url("evil.\u200dcom")
    assert _looks_like_url("buy at evil.rs")
    assert _looks_like_url("shop.com.py")
    assert not _looks_like_url("Node.js devs")
    assert not _looks_like_url("ethers.js users")
    assert not _looks_like_url("audit.sol")
    # ZWJ in ordinary (non-host) text is still fine.
    assert not _looks_like_url("family \U0001f468\u200d\U0001f469\u200d\U0001f467 readers")


async def test_put_rejects_control_characters(client: AsyncClient, session: AsyncSession) -> None:
    owner = Account.create()
    await _seed_slot(session, owner=owner.address.lower())
    await sign_in(client, owner)
    res = await client.put(
        "/v1/slots/1/listing",
        json={"summary": "hi\x00there", "audience": "y", "categories": []},
    )
    assert res.status_code == 422
    assert res.json()["error"] == "invalid_listing"


async def test_put_rejects_hidden_unicode_control_and_format_characters(
    client: AsyncClient, session: AsyncSession
) -> None:
    """A narrow ASCII-only `[\\x00-\\x1f\\x7f]` check misses all of these: a Cf bidi override
    (U+202E), a Cf zero-width space (U+200B), a C1 Cc control (U+009B), and a Cc separator that
    Python's `\\s` treats as whitespace (U+001C) and would otherwise collapse to a plain space
    before any check ran."""
    owner = Account.create()
    await _seed_slot(session, owner=owner.address.lower())
    await sign_in(client, owner)
    for bad_char in ["‮", "​", "\u009b", "\u001c"]:
        res = await client.put(
            "/v1/slots/1/listing",
            json={"summary": f"hi{bad_char}there", "audience": "y", "categories": []},
        )
        assert res.status_code == 422, repr(bad_char)
        assert res.json()["error"] == "invalid_listing"


async def test_category_filter_hits_and_misses(client: AsyncClient, session: AsyncSession) -> None:
    owner = Account.create()
    session.add_all(
        [
            make_slot(slot_id=1, owner=owner.address.lower(), domain="a.example"),
            make_slot(slot_id=2, owner=owner.address.lower(), domain="b.example"),
        ]
    )
    await session.commit()
    await sign_in(client, owner)
    await client.put(
        "/v1/slots/1/listing",
        json={"summary": "s1", "audience": "a1", "categories": ["defi"]},
    )
    await client.put(
        "/v1/slots/2/listing",
        json={"summary": "s2", "audience": "a2", "categories": ["dao-governance"]},
    )
    got_defi = await client.get("/v1/slots?category=defi")
    assert {s["slotId"] for s in got_defi.json()["items"]} == {"1"}
    got_dao = await client.get("/v1/slots?category=dao-governance")
    assert {s["slotId"] for s in got_dao.json()["items"]} == {"2"}
    got_missing = await client.get("/v1/slots?category=gaming")
    assert got_missing.json()["items"] == []


async def test_category_filter_prefix_trap(client: AsyncClient, session: AsyncSession) -> None:
    """The category taxonomy itself has no legal prefix collision (no category slug is a prefix
    of another), so this writes a listing row directly, bypassing `set_listing`'s taxonomy check,
    to prove the SQL ``LIKE '%,cat,%'`` pattern — not just Pydantic's enum validation — is what
    keeps "defi" from matching "defi-x"."""
    owner = "0x" + "aa" * 20
    session.add_all(
        [
            make_slot(slot_id=1, owner=owner, domain="a.example"),
            make_slot(slot_id=2, owner=owner, domain="b.example"),
        ]
    )
    session.add(
        SlotListing(
            slot_id=1, summary="s1", audience="a1", categories="defi", updated_at=datetime.now(UTC)
        )
    )
    session.add(
        SlotListing(
            slot_id=2,
            summary="s2",
            audience="a2",
            categories="defi-x",
            updated_at=datetime.now(UTC),
        )
    )
    await session.commit()

    got = await client.get("/v1/slots?category=defi")
    assert {s["slotId"] for s in got.json()["items"]} == {"1"}


async def test_delete_clears_the_listing(client: AsyncClient, session: AsyncSession) -> None:
    owner = Account.create()
    await _seed_slot(session, owner=owner.address.lower())
    await sign_in(client, owner)
    await client.put(
        "/v1/slots/1/listing",
        json={"summary": "s", "audience": "a", "categories": ["defi"]},
    )
    delete = await client.delete("/v1/slots/1/listing")
    assert delete.status_code == 204
    got = await client.get("/v1/slots/1")
    assert got.json()["listing"] is None


async def test_delete_requires_owner(client: AsyncClient, session: AsyncSession) -> None:
    owner = Account.create()
    other = Account.create()
    await _seed_slot(session, owner=owner.address.lower())
    await sign_in(client, owner)
    await client.put(
        "/v1/slots/1/listing",
        json={"summary": "s", "audience": "a", "categories": []},
    )
    await client.post("/v1/auth/logout")
    await sign_in(client, other)
    delete = await client.delete("/v1/slots/1/listing")
    assert delete.status_code == 403
