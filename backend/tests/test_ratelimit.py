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


def test_the_live_chain_measured_on_27_oct_needs_three_hops():
    """Measured on the live site (/system, "בדיקת כתובת הלקוח"): the chain was
    visitor, Cloudflare's edge, Render's internal proxy. With one hop the
    last entry (Render's, 10.x) was counted: every visitor as one."""
    chain = "83.130.6.63, 172.70.250.161, 10.24.198.78"
    assert client_address(request_from("10.24.198.78", chain), trusted_hops=1) == "10.24.198.78"  # the bug
    assert client_address(request_from("10.24.198.78", chain), trusted_hops=3) == "83.130.6.63"
    # What a visitor writes comes first and does not move the count from the right.
    forged = "6.6.6.6, " + chain
    assert client_address(request_from("10.24.198.78", forged), trusted_hops=3) == "83.130.6.63"


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


def test_one_address_over_its_own_limit_does_not_use_up_the_total():
    # A refused request is not counted in the total: otherwise one address
    # alone could fill it and lock every other visitor out.
    check = per_ip("test-share", limit=3, window_seconds=60, total_limit=10)
    for _ in range(50):
        try:
            check(request_from("10.0.0.1"), trusted_hops=0)
        except HTTPException:
            pass
    check(request_from("10.0.0.2"), trusted_hops=0)  # still let in


def test_the_campus_today_view_has_a_limit_of_its_own():
    # Every page asks for it (the pulse in the header), and the server keeps
    # it a minute: it must not use up the per-place forecasts' limit.
    from app.api.campus import router
    from app.ratelimit import forecast_limit, load_today_limit

    def limits(path: str) -> set:
        route = next(r for r in router.routes if getattr(r, "path", None) == path)
        return {d.call for d in route.dependant.dependencies}

    assert forecast_limit in limits("/places/{place_id}/forecast")
    assert load_today_limit in limits("/institutions/{slug}/load/today")
    assert forecast_limit not in limits("/institutions/{slug}/load/today")


def test_addresses_refused_by_the_total_are_not_remembered():
    # A flood of new addresses past the total must not fill the
    # per-address table, or every new real visitor would be refused.
    from app.ratelimit import LIMITERS

    check = per_ip("test-flood", limit=3, window_seconds=60, total_limit=10)
    for i in range(200):
        try:
            check(request_from(f"10.1.{i // 250}.{i % 250}"), trusted_hops=0)
        except HTTPException:
            pass
    assert len(LIMITERS["test-flood"]._hits) <= 10


def test_a_window_that_evicts_lets_a_new_key_in_when_full():
    # For keys a visitor makes up (a cookie): a full table drops its oldest
    # key rather than refuse everyone new, so a flood of made-up cookies
    # cannot lock real visitors out.
    window = SlidingWindow(limit=5, window_seconds=60, max_keys=3, evict=True)
    for key in ("a", "b", "c"):
        assert window.allow(key)
    assert window.allow("new")
    assert "a" not in window._hits


def test_ipv6_addresses_in_one_slash_64_count_as_one():
    # One home or phone gets a whole /64; a new address per request must
    # not escape the per-address limit.
    check = per_ip("test-v6", limit=3, window_seconds=60)
    statuses = []
    for i in range(1, 6):
        try:
            check(request_from(f"2001:db8:1:2::{i:x}"), trusted_hops=0)
            statuses.append(200)
        except HTTPException as refused:
            statuses.append(refused.status_code)
    assert statuses == [200, 200, 200, 429, 429]
    check(request_from("2001:db8:1:3::1"), trusted_hops=0)  # another /64: let in


def test_refreshing_a_session_is_limited_per_address_too():
    # Before the cookie is even looked at: one address cannot send cookie
    # after made-up cookie without end.
    from app.api.auth import router
    from app.ratelimit import refresh_address_limit, refresh_limit

    route = next(r for r in router.routes if getattr(r, "path", None) == "/auth/refresh")
    calls = [d.call for d in route.dependant.dependencies]
    assert calls.index(refresh_address_limit) < calls.index(refresh_limit)


@pytest.fixture(autouse=True)
def _forget_test_limiters():
    yield
    from app.ratelimit import LIMITERS

    for name in [n for n in LIMITERS if n.startswith("test-")]:
        del LIMITERS[name]


def test_a_few_addresses_at_their_limit_do_not_shut_sign_in_for_everyone():
    # From the test round's security review, 25 Oct: five addresses at
    # 120 a minute each used up a site-wide 600, and a sixth was refused.
    from app.ratelimit import sign_in_limit

    for attacker in range(5):
        for _ in range(120):
            sign_in_limit(request_from("10.0.0.1", f"198.51.100.{attacker + 1}"), trusted_hops=1)
    sign_in_limit(request_from("10.0.0.1", "203.0.113.50"), trusted_hops=1)  # a new visitor: not refused
