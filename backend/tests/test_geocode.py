"""Place search for the admin's map, through our server to OpenStreetMap's
Nominatim, under its usage policy (operations.osmfoundation.org/policies/
nominatim): at most one request a second for the whole site, results kept,
an identifying User-Agent, and a search only when the admin asks."""

import httpx
import pytest

from app.api.auth import get_http_client
from app.geocode import Geocoder
from app.main import app
from app.models import User, UserRole

ANSWER = [{"display_name": "כרמיאל, ישראל", "lat": "32.9171", "lon": "35.3050"}]


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def make(seen: list[httpx.Request], clock: FakeClock, status: int = 200) -> Geocoder:
    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(status, json=ANSWER)

    http = httpx.Client(transport=httpx.MockTransport(handle))
    return Geocoder(http, "https://nominatim.example/search", "StudySpot (+https://site.example)", clock=clock)


def test_a_search_asks_once_with_an_identifying_user_agent():
    seen, clock = [], FakeClock()
    found = make(seen, clock).search("כרמיאל")
    assert found == [{"name": "כרמיאל, ישראל", "latitude": 32.9171, "longitude": 35.305}]
    assert seen[0].headers["user-agent"].startswith("StudySpot")
    assert seen[0].url.params["q"] == "כרמיאל"


def test_the_same_search_is_answered_from_memory():
    seen, clock = [], FakeClock()
    geocoder = make(seen, clock)
    geocoder.search("Karmiel")
    clock.now += 5
    geocoder.search("  karmiel ")
    assert len(seen) == 1


def test_more_than_one_new_search_a_second_is_refused():
    seen, clock = [], FakeClock()
    geocoder = make(seen, clock)
    geocoder.search("כרמיאל")
    with pytest.raises(Exception) as refused:
        geocoder.search("חיפה")
    assert getattr(refused.value, "code", None) == "geocode_busy"
    clock.now += 1.1
    geocoder.search("חיפה")
    assert len(seen) == 2


def test_a_failing_service_says_so():
    seen, clock = [], FakeClock()
    with pytest.raises(Exception) as failed:
        make(seen, clock, status=503).search("כרמיאל")
    assert getattr(failed.value, "code", None) == "geocode_unavailable"


def test_only_admins_can_search(client, session, braude):
    assert client.get("/admin/geocode", params={"q": "כרמיאל"}).status_code == 403


@pytest.fixture(autouse=True)
def fresh_shared(monkeypatch):
    # The endpoint keeps its cache and its last call between requests:
    # each test starts from none, so tests do not wait on each other.
    import app.api.admin as admin_api
    from app.geocode import _Shared

    monkeypatch.setattr(admin_api, "SHARED", _Shared())


def test_the_endpoint_returns_places(client, session, braude):
    admin = User(institution_id=braude.id, email="a@braude.ac.il", display_name="A", role=UserRole.INSTITUTION_ADMIN)
    session.add(admin)
    session.flush()
    client.user = admin
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=ANSWER))
    app.dependency_overrides[get_http_client] = lambda: httpx.Client(transport=transport)
    try:
        response = client.get("/admin/geocode", params={"q": "כרמיאל אנגלית"})
    finally:
        app.dependency_overrides.pop(get_http_client, None)
    assert response.status_code == 200
    assert response.json()[0]["name"] == "כרמיאל, ישראל"


@pytest.mark.parametrize("q", ["", "a", "x" * 121])
def test_a_search_too_short_or_too_long_is_refused(client, session, braude, q):
    admin = User(institution_id=braude.id, email="a@braude.ac.il", display_name="A", role=UserRole.INSTITUTION_ADMIN)
    session.add(admin)
    session.flush()
    client.user = admin
    assert client.get("/admin/geocode", params={"q": q}).status_code == 422


def test_the_memory_of_searches_has_a_limit(monkeypatch):
    # Every new search adds one; without a limit they would pile up for good.
    from app import geocode

    monkeypatch.setattr(geocode, "MAX_CACHED", 3)
    seen, clock = [], FakeClock()
    geocoder = make(seen, clock)
    for n in range(5):
        geocoder.search(f"place {n}")
        clock.now += 1.5
    assert len(geocoder.shared.cache) == 3
    assert "place 0" not in geocoder.shared.cache  # the oldest went first


def test_old_results_are_dropped_when_new_ones_come(monkeypatch):
    seen, clock = [], FakeClock()
    geocoder = make(seen, clock)
    geocoder.search("old")
    clock.now += 2 * 60 * 60  # past the hour
    geocoder.search("new")
    assert list(geocoder.shared.cache) == ["new"]
