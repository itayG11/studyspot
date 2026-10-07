"""The production server: the API under /api and the built web app, from
one address, so the sign-in cookie is never a third-party cookie. Every
answer carries the security headers."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.site import create_site


@pytest.fixture
def built(tmp_path: Path) -> Path:
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "index-abc123.js").write_text("console.log('app')")
    (tmp_path / "images").mkdir()
    (tmp_path / "images" / "hero-800.webp").write_bytes(b"RIFF....WEBP")
    (tmp_path / "index.html").write_text("<!doctype html><title>StudySpot</title>")
    (tmp_path.parent / "secret.txt").write_text("not for the web")
    return tmp_path


@pytest.fixture
def site(built: Path) -> TestClient:
    return TestClient(create_site(built))


def test_the_api_lives_under_api(site: TestClient):
    assert site.get("/api/health").json() == {"status": "ok"}


@pytest.mark.parametrize("path", ["/", "/spaces/5", "/me", "/scan", "/admin", "/login"])
def test_every_page_of_the_web_app_gets_index_html(site: TestClient, path: str):
    response = site.get(path)
    assert response.status_code == 200
    assert "StudySpot" in response.text
    # The page itself is always checked again, so a new release shows at once.
    assert response.headers["cache-control"] == "no-cache"


def test_built_files_are_served_and_cached_for_a_year(site: TestClient):
    response = site.get("/assets/index-abc123.js")
    assert response.status_code == 200
    assert "console.log" in response.text
    # Their names change with their content, so they can be kept forever.
    assert "immutable" in response.headers["cache-control"]
    assert site.get("/images/hero-800.webp").status_code == 200


def test_a_missing_file_is_404_not_the_web_app(site: TestClient):
    assert site.get("/assets/missing.js").status_code == 404
    assert site.get("/images/missing.webp").status_code == 404


def test_files_outside_the_build_are_never_served(site: TestClient):
    for path in ["/../secret.txt", "/%2e%2e/secret.txt", "/images/..%2f..%2fsecret.txt"]:
        assert "not for the web" not in site.get(path).text


def test_the_api_docs_are_not_public(site: TestClient):
    for path in ["/api/docs", "/api/redoc", "/api/openapi.json"]:
        assert site.get(path).status_code == 404
    assert site.get("/api/health").status_code == 200


def test_odd_addresses_are_404_not_a_server_error(site: TestClient):
    for path in ["/a%00", "/a%00.txt", "/" + "x" * 5000, "/" + "x" * 5000 + ".js"]:
        response = site.get(path)
        assert response.status_code in (200, 404), path  # a page of the app, or missing
        assert "content-security-policy" in response.headers


def test_an_unknown_api_address_is_a_json_404_not_the_web_app(site: TestClient):
    response = site.get("/api/nothing-here")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")


@pytest.mark.parametrize("path", ["/", "/api/health", "/assets/index-abc123.js"])
def test_security_headers_on_every_answer(site: TestClient, path: str):
    headers = site.get(path).headers
    csp = headers["content-security-policy"]
    assert "default-src 'self'" in csp
    assert "script-src 'self'" in csp and "unsafe-inline" not in csp.split("script-src")[1].split(";")[0]
    assert "frame-ancestors 'none'" in csp
    assert "object-src 'none'" in csp
    # The map's tiles are the only outside content.
    assert "https://tile.openstreetmap.org" in csp and "https://server.arcgisonline.com" in csp
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "camera=()" in headers["permissions-policy"]
    assert headers["strict-transport-security"].startswith("max-age=")
