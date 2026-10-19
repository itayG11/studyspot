"""Rate limiting: at most `limit` requests per `window` seconds per key.

A sliding window kept in memory: for each key, the times of its recent
requests. It is per process, which is enough for one server; with several
servers the counters would move to a shared store such as Redis.
"""

import hashlib
import ipaddress
import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import Settings, get_settings
from app.models import User


class SlidingWindow:
    def __init__(self, limit: int, window_seconds: float, max_keys: int = 10_000, evict: bool = False):
        """evict: when the table is full, drop the oldest key for a new one,
        instead of refusing. For keys a visitor makes up at will (a cookie),
        where refusing new keys would let a flood lock real visitors out."""
        self.limit, self.window, self.max_keys, self.evict = limit, window_seconds, max_keys, evict
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            if key not in self._hits:
                self._prune(now)
                # Full even after forgetting old keys: a flood of new keys
                # (say, faked addresses) is refused instead of growing memory.
                if len(self._hits) >= self.max_keys:
                    if not self.evict:
                        return False
                    # The first key in the dict is the oldest one added.
                    del self._hits[next(iter(self._hits))]
            hits = self._hits[key]
            while hits and hits[0] <= now - self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            return True

    def give_back(self, key: str) -> None:
        """Undo the last hit allow() counted for key, when a later check
        refuses the request after all; a key left with no hits is forgotten."""
        with self._lock:
            hits = self._hits.get(key)
            if hits:
                hits.pop()
                if not hits:
                    del self._hits[key]

    def _prune(self, now: float) -> None:
        """Forget keys with no recent requests, so memory does not grow forever."""
        if len(self._hits) < self.max_keys:
            return
        for key in [k for k, h in self._hits.items() if not h or h[-1] <= now - self.window]:
            del self._hits[key]

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


LIMITERS: dict[str, SlidingWindow] = {}


def _too_many(window: SlidingWindow) -> HTTPException:
    return HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS,
        "too_many_requests",
        headers={"Retry-After": str(int(window.window))},
    )


def client_address(request: Request, trusted_hops: int) -> str:
    """The visitor's address, as far as it can be trusted.

    X-Forwarded-For is a list that each proxy on the way adds to, at the
    end. Whatever the visitor wrote comes first, so only the entries added
    by our own proxies mean anything: with N trusted proxies, the visitor
    is the Nth entry from the right. With none (development), the header is
    ignored and the connection's own address is used.
    """
    connected = request.client.host if request.client else "unknown"
    if trusted_hops <= 0:
        return connected
    header = request.headers.get("x-forwarded-for", "")
    hops = [part.strip() for part in header.split(",") if part.strip()]
    return hops[-trusted_hops] if len(hops) >= trusted_hops else connected


def address_key(address: str) -> str:
    """The key an address is counted under. An IPv6 home or phone gets a
    whole /64 and may use a new address for every request, so those count
    as one; IPv4, and anything that is not an address, as they are."""
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return address
    if ip.version == 6 and ip.ipv4_mapped is None:
        return str(ipaddress.ip_network(f"{ip}/64", strict=False))
    return str(ip)


def _trusted_hops(settings: Annotated[Settings, Depends(get_settings)]) -> int:
    return settings.trusted_proxy_hops


def per_ip(name: str, limit: int, window_seconds: float, total_limit: int | None = None) -> Callable:
    """For endpoints without a user, such as sign-in.

    A total over all addresses backs the per-address limit up: one small
    server, and a last line if the proxy setup is ever wrong.
    """
    window = LIMITERS.setdefault(name, SlidingWindow(limit, window_seconds))
    total = LIMITERS.setdefault(f"{name}:total", SlidingWindow(total_limit, window_seconds)) if total_limit else None

    def dependency(request: Request, trusted_hops: Annotated[int, Depends(_trusted_hops)]) -> None:
        # The address first: a request it refuses is not counted in the
        # total, so one address alone can never use the total up. A request
        # the total refuses is not kept against its address either, so a
        # flood of new addresses cannot fill the table of addresses.
        client = address_key(client_address(request, trusted_hops))
        if not window.allow(client):
            raise _too_many(window)
        if total is not None and not total.allow("all"):
            window.give_back(client)
            raise _too_many(total)

    return dependency


def per_cookie(name: str, cookie: str, limit: int, window_seconds: float) -> Callable:
    """Per session, not per IP: a whole campus may share one public address."""
    # Made-up cookies are free to send: a full table drops its oldest
    # instead of refusing everyone new (evict).
    window = LIMITERS.setdefault(name, SlidingWindow(limit, window_seconds, evict=True))

    def dependency(request: Request) -> None:
        value = request.cookies.get(cookie)
        # No cookie: the endpoint answers 401 at once, without the database.
        # Counting every such visitor in one shared bucket would refuse the
        # whole site after a few page loads a minute.
        if not value:
            return
        if not window.allow(hashlib.sha256(value.encode()).hexdigest()):
            raise _too_many(window)

    return dependency


# The limits used by the routes. Sign-in is per IP and generous, because a
# campus network can put many students behind one address. The total is a
# backstop for the whole site (one small server): 600 sign-ins a minute is
# far above a campus at its busiest hour.
sign_in_limit = per_ip("sign-in", limit=120, window_seconds=60, total_limit=600)
# Each start sends an email, so it is far stricter than sign-in. Per address
# and per day there are limits in the database too (app/email_codes.py).
# The daily one keeps a single address from using up the site's daily email
# quota (made-up mailboxes at a real domain); a campus behind one address
# still has room, since a session lasts a week.
_email_start_10_minutes = per_ip("email-start", limit=30, window_seconds=600, total_limit=200)
_email_start_day = per_ip("email-start-day", limit=50, window_seconds=86_400)


def email_start_limit(
    _ten: Annotated[None, Depends(_email_start_10_minutes)], _day: Annotated[None, Depends(_email_start_day)]
) -> None:
    """Both limits, short and daily."""
# Refreshing: per address first, generous since a campus shares one, and
# without a total (one address cannot fill it); then per session.
refresh_address_limit = per_ip("refresh-address", limit=300, window_seconds=60)
refresh_limit = per_cookie("refresh", "studyspot_refresh", limit=10, window_seconds=60)
# The load forecast is public and reads weeks of counts: a page asks for a
# day at a time, so a person is far below this.
FORECAST_PER_MINUTE = 60
forecast_limit = per_ip("forecast", limit=FORECAST_PER_MINUTE, window_seconds=60, total_limit=1200)
# The campus's today view: every page asks for it (the pulse in the header,
# in every open tab), and the server keeps it a minute (app/load_today.py),
# so a repeat costs one query. Its own limit, and generous, so that a
# campus network behind one address does not use up the forecasts' limit.
load_today_limit = per_ip("load-today", limit=600, window_seconds=60, total_limit=6000)
# A calendar app reads a feed every few hours; this is far above that, and
# keeps someone guessing tokens slow (they are 256 bits anyway).
calendar_limit = per_ip("calendar", limit=60, window_seconds=60, total_limit=1200)
# A screen asks about every 20 seconds, and a campus's screens may share one
# address: 300 a minute is about 100 screens behind one network.
screen_limit = per_ip("screen", limit=300, window_seconds=60, total_limit=6000)


def per_person(name: str, limit: int, window_seconds: float) -> Callable:
    """Per signed-in user, except for a shared demo user: every visitor
    is that one user, so each visitor's address counts on its own instead."""
    from app.api.deps import get_session
    from app.models import AuthProvider, UserIdentity

    window = LIMITERS.setdefault(name, SlidingWindow(limit, window_seconds))

    def dependency(
        request: Request,
        user: Annotated[User, Depends(get_current_user)],
        db: Annotated[Session, Depends(get_session)],
        trusted_hops: Annotated[int, Depends(_trusted_hops)],
    ) -> None:
        shared = db.scalars(
            select(UserIdentity.id).where(UserIdentity.user_id == user.id, UserIdentity.provider == AuthProvider.DEMO)
        ).first()
        key = f"address:{address_key(client_address(request, trusted_hops))}" if shared else f"user:{user.id}"
        if not window.allow(key):
            raise _too_many(window)

    return dependency


# Writes, and the admin map's place search (app/geocode.py; a person types
# slowly). Per person, so that one visitor of the shared demo users cannot
# use up the others' writes.
write_limit = per_person("writes", limit=30, window_seconds=60)
geocode_limit = per_person("geocode", limit=10, window_seconds=60)
# Checking a domain's TXT record (app/dns_verify.py): each try asks a public resolver.
dns_check_limit = per_person("dns_check", limit=6, window_seconds=60)


# Suggestions between classes read every place, and the forecast of each:
# a page asks every half minute, so a person is far below this.
# Reading a timetable file is heavier than a write: a few a minute is plenty.
import_limit = per_person("timetable-import", limit=10, window_seconds=60)
campus_import_limit = per_person("campus-import", limit=10, window_seconds=60)
BETWEEN_PER_MINUTE = 30
between_limit = per_person("between-classes", limit=BETWEEN_PER_MINUTE, window_seconds=60)



# A photo costs a request to a paid service: one a minute and five a day per
# person, and a ceiling for the whole site, whoever asks.
photo_minute = per_person("timetable-photo-minute", limit=1, window_seconds=60)
photo_day = per_person("timetable-photo-day", limit=5, window_seconds=24 * 3600)
_photo_site = LIMITERS.setdefault("timetable-photo-site", SlidingWindow(200, 24 * 3600))


def photo_site() -> None:
    if not _photo_site.allow("all"):
        raise _too_many(_photo_site)
