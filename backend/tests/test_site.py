"""The production server: the API under /api and the built web app, from
one address, so the sign-in cookie is never a third-party cookie. Every
answer carries the security headers."""

import re
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
    (tmp_path / "manifest.webmanifest").write_text('{"name": "StudySpot"}')
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


def test_the_install_manifest_is_served_as_a_manifest(site: TestClient):
    # With nosniff, a file is only what its type says: text/plain would not
    # be read as the app's install details.
    response = site.get("/manifest.webmanifest")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/manifest+json")


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


def test_head_requests_are_answered_like_get(site: TestClient):
    # Uptime monitors and `curl -I` ask with HEAD.
    assert site.head("/").status_code == 200
    assert "content-security-policy" in site.head("/").headers
    assert site.head("/spaces/5").status_code == 200


def test_the_bare_api_address_is_not_the_web_app(site: TestClient):
    response = site.get("/api")
    assert response.status_code == 404
    assert "StudySpot" not in response.text


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
    img_src = next(d.split()[1:] for d in csp.split(";") if d.split()[:1] == ["img-src"])
    assert {"https://tile.openstreetmap.org", "https://server.arcgisonline.com"} <= set(img_src)
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "camera=()" in headers["permissions-policy"]
    # Location for the admin's "my location" on the map: this site only,
    # never a page embedded in it. The browser still asks the visitor.
    assert "geolocation=(self)" in headers["permissions-policy"]
    assert headers["strict-transport-security"].startswith("max-age=")


def test_a_server_error_still_carries_the_security_headers(built: Path):
    # A crash is answered by Starlette outside the app's own middleware; the
    # headers are added outside that again (app/edge.py).
    wrapped = create_site(built)

    def boom() -> None:
        raise RuntimeError("a bug")

    wrapped.site.add_api_route("/boom", boom)
    routes = wrapped.site.router.routes
    routes.insert(0, routes.pop())  # before the web app's catch-all page
    response = TestClient(wrapped, raise_server_exceptions=False).get("/boom")
    assert response.status_code == 500
    assert "default-src 'self'" in response.headers["content-security-policy"]
    assert response.headers["strict-transport-security"].startswith("max-age=")
    assert response.headers["x-request-id"]


def test_every_answer_has_a_request_id_and_one_log_line_without_the_query(site: TestClient, caplog):
    import logging

    with caplog.at_level(logging.INFO, logger="studyspot.requests"):
        response = site.get("/api/nowhere?code=secret-from-the-provider")
    request_id = response.headers["x-request-id"]
    assert re.fullmatch(r"[0-9a-f]{12}", request_id)
    lines = [r.getMessage() for r in caplog.records if r.name == "studyspot.requests"]
    assert len(lines) == 1
    assert request_id in lines[0] and "GET /api/nowhere 404" in lines[0]
    assert "secret" not in lines[0]  # sign-in codes travel in the query


def test_the_health_check_is_not_logged_while_it_is_well(site: TestClient, caplog):
    # Asked every half minute by the monitor and the container.
    import logging

    with caplog.at_level(logging.INFO, logger="studyspot.requests"):
        site.get("/api/health")
    assert not [r for r in caplog.records if r.name == "studyspot.requests"]


def test_information_from_the_app_reaches_the_log():
    # Without a handler, Python drops anything below WARNING: the sweeper's
    # and the daily reset's notes never showed on Render.
    import logging

    from app.edge import configure_logging

    configure_logging()
    assert logging.getLogger("app.sweeper").getEffectiveLevel() <= logging.INFO
    assert logging.getLogger("studyspot").getEffectiveLevel() <= logging.INFO


# --- What search engines and link previews read --------------------------------

PUBLIC = Path(__file__).resolve().parents[2] / "frontend" / "public"
INDEX = Path(__file__).resolve().parents[2] / "frontend" / "index.html"


def test_robots_and_the_sitemap_are_served_as_text_and_xml(built):
    import shutil

    for name in ("robots.txt", "sitemap.xml"):
        shutil.copy(PUBLIC / name, built / name)
    client = TestClient(create_site(built))
    robots = client.get("/robots.txt")
    assert robots.status_code == 200 and robots.headers["content-type"].startswith("text/plain")
    sitemap = client.get("/sitemap.xml")
    assert sitemap.status_code == 200 and "xml" in sitemap.headers["content-type"]


def test_robots_keeps_personal_pages_out_of_search_and_only_them():
    # Each rule ends with "$": "/me" alone, never an institution called
    # "medicine" (robots rules match by prefix otherwise).
    rules = (PUBLIC / "robots.txt").read_text()
    for page in ("/me", "/admin", "/system", "/invite", "/scan", "/login", "/signed-in", "/*/me", "/*/admin"):
        assert f"Disallow: {page}$" in rules
    assert not re.search(r"Disallow: /[\w-]+\n", rules)  # no rule without its "$"


def test_the_site_address_is_the_same_everywhere_it_is_written():
    # On a move to the domain these three change together (docs/DEPLOY.md).
    robots = re.search(r"Sitemap: (https://[^/\s]+)", (PUBLIC / "robots.txt").read_text())[1]
    sitemap = set(re.findall(r"<loc>(https://[^/<]+)", (PUBLIC / "sitemap.xml").read_text()))
    index = set(re.findall(r'content="(https://[^/"]+)', INDEX.read_text()))
    assert sitemap == index == {robots}
    assert (PUBLIC / "og-image.jpg").is_file()


def test_text_files_are_sent_compressed_and_pictures_as_they_are(built):
    (built / "assets" / "big-def456.js").write_text("console.log('app');\n" * 500)
    (built / "images" / "big.webp").write_bytes(b"RIFF" + bytes(range(256)) * 20)
    client = TestClient(create_site(built))
    script = client.get("/assets/big-def456.js", headers={"Accept-Encoding": "gzip"})
    assert script.headers.get("content-encoding") == "gzip"
    assert script.text.startswith("console.log")  # the client unpacks it
    picture = client.get("/images/big.webp", headers={"Accept-Encoding": "gzip"})
    assert "content-encoding" not in picture.headers  # already compressed: no work for nothing
    assert script.headers.get("content-security-policy")  # the headers survive compression


def test_a_link_in_the_build_that_points_outside_is_not_served(built: Path):
    (built / "assets" / "leak.txt").symlink_to(built.parent / "secret.txt")
    site = TestClient(create_site(built))
    assert site.get("/assets/leak.txt").status_code == 404
