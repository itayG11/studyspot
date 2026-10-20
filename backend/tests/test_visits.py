"""Wave 14 review: machines that ask on their own all day (the occupancy
widget, an institution's script on /v1) are not visitors, so they do not
keep the background sweep, and the free database, awake."""

from types import SimpleNamespace

from app.main import _is_visit


def _request(path: str, headers: dict[str, str] | None = None):
    return SimpleNamespace(url=SimpleNamespace(path=path), headers=headers or {})


def test_a_person_on_the_site_is_a_visit():
    assert _is_visit(_request("/institutions/demo/places"))
    assert _is_visit(_request("/api/institutions/demo/places"))


def test_the_widget_the_api_and_the_monitor_are_not():
    assert not _is_visit(_request("/institutions/demo/places", {"x-studyspot-widget": "1"}))
    assert not _is_visit(_request("/api/v1/places"))
    assert not _is_visit(_request("/v1/places"))
    assert not _is_visit(_request("/api/health"))
