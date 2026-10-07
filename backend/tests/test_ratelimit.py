"""The limiter itself, including a visitor who fakes a new address on every
request (X-Forwarded-For can say anything a client wants)."""

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.ratelimit import SlidingWindow, client_address, per_ip


def request_from(host: str, forwarded: str | None = None) -> Request:
    headers = [(b"x-forwarded-for", forwarded.encode())] if forwarded else []
    return Request({"type": "http", "method": "GET", "path": "/", "headers": headers, "client": (host, 1234)})


def test_without_a_trusted_proxy_the_connection_address_is_used():
    # A header from the visitor is ignored: anyone can write anything in it.
    assert client_address(request_from("203.0.113.9", "1.2.3.4"), trusted_hops=0) == "203.0.113.9"


def test_behind_one_proxy_the_address_it_added_is_used_not_what_the_visitor_wrote():
    # The visitor wrote 1.2.3.4; the host's proxy added the real address last.
    request = request_from("10.0.0.1", "1.2.3.4, 198.51.100.7")
    assert client_address(request, trusted_hops=1) == "198.51.100.7"


def test_behind_two_proxies_the_second_from_the_right_is_the_visitor():
    request = request_from("10.0.0.1", "1.2.3.4, 198.51.100.7, 172.16.0.5")
    assert client_address(request, trusted_hops=2) == "198.51.100.7"


def test_a_missing_or_short_header_falls_back_to_the_connection():
    assert client_address(request_from("10.0.0.1"), trusted_hops=1) == "10.0.0.1"
    assert client_address(request_from("10.0.0.1", "198.51.100.7"), trusted_hops=2) == "10.0.0.1"


def test_faking_the_header_does_not_escape_the_per_address_limit():
    check = per_ip("test-spoof", limit=3, window_seconds=60)
    statuses = []
    for i in range(5):
        try:
            check(request_from("10.0.0.1", f"9.9.9.{i}, 198.51.100.7"), trusted_hops=1)
            statuses.append(200)
        except HTTPException as refused:
            statuses.append(refused.status_code)
    assert statuses == [200, 200, 200, 429, 429]


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
            check(request_from(f"10.0.0.{i}"), trusted_hops=0)
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
