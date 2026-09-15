from openad.services.periods import dutch_price
from tests.conftest import make_terms


def test_dutch_and_remainder_prices() -> None:
    terms = make_terms(lead_seconds=100, start_price=100, floor_price=10)
    start, end = 1_000, 2_000
    sellable, reason, price = dutch_price(terms, start, end, now=900)
    assert sellable and reason == "" and price == 100
    sellable, reason, price = dutch_price(terms, start, end, now=1_000)
    assert sellable and reason == "remainder" and price == 10
    sellable, reason, price = dutch_price(terms, start, end, now=1_500)
    assert sellable and reason == "remainder" and price == 5
    sellable, reason, price = dutch_price(terms, start, end, now=2_000)
    assert not sellable and reason == "closed"
