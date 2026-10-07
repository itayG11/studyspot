"""The limiter itself, including a visitor who fakes a new address on every
request (X-Forwarded-For can say anything a client wants)."""

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.ratelimit import SlidingWindow, per_ip


def request_from(host: str) -> Request:
    return Request({"type": "http", "method": "GET", "path": "/", "headers": [], "client": (host, 1234)})


def test_a_window_counts_each_key_on_its_own():
    window = SlidingWindow(limit=2, window_seconds=60)
    assert window.allow("a") and window.allow("a")
    assert not window.allow("a")
    assert window.allow("b")


def test_the_number_of_remembered_keys_is_capped():
    # A flood of new addresses cannot grow memory without end: once full,
    # a new key is refused until old ones expire.
    window = SlidingWindow(limit=5, window_seconds=60, max_keys=100)
    for i in range(100):
        assert window.allow(f"ip-{i}")
    assert not window.allow("ip-new")
    assert window.allow("ip-7")  # a key it already knows still works


def test_a_new_fake_address_on_every_request_still_hits_the_total_limit():
    check = per_ip("test-total", limit=3, window_seconds=60, total_limit=10)
    statuses = []
    for i in range(12):
        try:
            check(request_from(f"10.0.0.{i}"))
            statuses.append(200)
        except HTTPException as refused:
            statuses.append(refused.status_code)
    assert statuses[:10] == [200] * 10
    assert statuses[10:] == [429, 429]


@pytest.fixture(autouse=True)
def _forget_test_limiters():
    yield
    from app.ratelimit import LIMITERS

    for name in [n for n in LIMITERS if n.startswith("test-")]:
        del LIMITERS[name]
