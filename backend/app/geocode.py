"""Place search for the admin's map: through our server to OpenStreetMap's
Nominatim, under its usage policy
(https://operations.osmfoundation.org/policies/nominatim/):

- at most one request a second, for the whole site;
- results kept (the same search is not sent twice);
- a User-Agent that names the application;
- a search only when the admin presses the button: no autocomplete;
- the service is a setting (GEOCODER_URL), switchable without a new version.

Through the server, the admin's own address never reaches the service, and
the site's Content-Security-Policy stays connect-src 'self'.
"""

import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field

import httpx

from app.errors import Refusal

CACHE_SECONDS = 60 * 60
MIN_GAP_SECONDS = 1.0
MAX_RESULTS = 5
MAX_CACHED = 1000  # searches kept; the oldest goes first


@dataclass
class _Shared:
    """Kept between requests: the cache and the time of the last call."""

    cache: dict[str, tuple[float, list[dict]]] = field(default_factory=dict)
    last_call: float = float("-inf")
    lock: threading.Lock = field(default_factory=threading.Lock)


SHARED = _Shared()


class Geocoder:
    def __init__(
        self,
        http: httpx.Client,
        url: str,
        user_agent: str,
        clock: Callable[[], float] = time.monotonic,
        shared: _Shared | None = None,
    ):
        self.http, self.url, self.user_agent, self.clock = http, url, user_agent, clock
        self.shared = shared if shared is not None else _Shared()

    def search(self, query: str) -> list[dict]:
        key = " ".join(query.lower().split())
        with self.shared.lock:
            now = self.clock()
            kept = self.shared.cache.get(key)
            if kept is not None and now - kept[0] < CACHE_SECONDS:
                return kept[1]
            if now - self.shared.last_call < MIN_GAP_SECONDS:
                raise Refusal(429, "geocode_busy")
            self.shared.last_call = now
        try:
            response = self.http.get(
                self.url,
                params={"q": query, "format": "jsonv2", "limit": MAX_RESULTS, "accept-language": "he"},
                headers={"User-Agent": self.user_agent},
                timeout=10,
            )
            response.raise_for_status()
            found = [
                {"name": str(item["display_name"])[:300], "latitude": float(item["lat"]), "longitude": float(item["lon"])}
                for item in response.json()[:MAX_RESULTS]
            ]
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            raise Refusal(502, "geocode_unavailable") from None
        with self.shared.lock:
            cache = self.shared.cache
            for old in [k for k, (at, _) in cache.items() if now - at >= CACHE_SECONDS]:
                del cache[old]
            cache[key] = (now, found)
            while len(cache) > MAX_CACHED:
                del cache[next(iter(cache))]  # dicts keep insertion order: the oldest
        return found
