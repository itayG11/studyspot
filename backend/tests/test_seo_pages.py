"""Each public page says which address it is (a canonical link) and has a title
and a description of its own. The web app is one file for every address, so
before this Google saw eight identical pages and, in Search Console (16 Nov),
reported "duplicate without user-selected canonical"."""

import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import seo
from app.site import create_site

REPO = Path(__file__).resolve().parents[2]
INDEX = REPO / "frontend" / "index.html"
SITEMAP = REPO / "frontend" / "public" / "sitemap.xml"


@pytest.fixture
def site(tmp_path: Path) -> TestClient:
    (tmp_path / "index.html").write_text(INDEX.read_text())
    return TestClient(create_site(tmp_path))


def canonical(page: str) -> list[str]:
    return re.findall(r'<link rel="canonical" href="([^"]*)"', page)


def title(page: str) -> str:
    return re.search(r"<title>([^<]*)</title>", page)[1]


def description(page: str) -> str:
    return re.search(r'<meta name="description" content="([^"]*)"', page)[1]


PAGES = [path for path in seo.PAGES if path]


@pytest.mark.parametrize("path", PAGES)
def test_a_public_page_names_itself_as_its_address(site: TestClient, path: str):
    response = site.get(f"/{path}")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-cache"
    # The test client's address is the settings' frontend_url.
    assert canonical(response.text) == [f"http://localhost:5173/{path}"]


def test_the_front_address_is_the_same_page_as_the_demo(site: TestClient):
    # "/" sends a visitor to their home institution, the demo campus for a new one.
    assert canonical(site.get("/").text) == ["http://localhost:5173/demo"]


def test_every_public_page_has_a_title_and_a_description_of_its_own(site: TestClient):
    pages = [site.get(f"/{path}").text for path in PAGES]
    titles = [title(page) for page in pages]
    descriptions = [description(page) for page in pages]
    assert len(set(titles)) == len(titles), titles
    assert len(set(descriptions)) == len(descriptions), descriptions
    # The shared link's title and text (WhatsApp, LinkedIn) follow the page's own.
    # The demo keeps the ones it has, worded for sharing.
    for path in PAGES:
        if seo.PAGES[path].title is None:
            continue
        page = site.get(f"/{path}").text
        assert f'<meta property="og:title" content="{title(page)}"' in page
        assert f'<meta property="og:description" content="{description(page)}"' in page


def test_the_demo_keeps_the_title_search_results_show_today(site: TestClient):
    page = site.get("/demo").text
    assert title(page) == title(INDEX.read_text())
    assert description(page) == description(INDEX.read_text())


def test_the_sitemap_lists_only_pages_that_name_themselves():
    listed = re.findall(r"<loc>https://[^/<]+/([^<]*)</loc>", SITEMAP.read_text())
    assert listed and [path for path in listed if path not in seo.PAGES] == []


def test_the_page_file_still_has_what_the_page_is_built_from():
    # An edit of index.html that drops the <head> or one of the tags would
    # silently end this, so it is checked on the real file.
    page = seo.page_html(INDEX.read_text(), "privacy", "https://getstudyspot.me")
    assert canonical(page) == ["https://getstudyspot.me/privacy"]
    assert title(page) != title(INDEX.read_text())
    assert page.count("<title>") == 1


def test_an_address_the_site_does_not_list_gets_no_canonical_link(site: TestClient):
    # An institution's own page, or an address that is no page at all: it is
    # not for this site to say what it is the same as.
    for path in ("/braude", "/nothing-here", "/braude/spaces/3", "/privacy/"):
        page = site.get(path).text
        assert canonical(page) == [], path
        assert title(page) == title(INDEX.read_text()), path


def test_a_shared_stay_is_still_kept_out_of_search(site: TestClient):
    assert 'content="noindex"' in site.get("/s/abc").text


def test_head_requests_are_answered_for_the_public_pages_too(site: TestClient):
    response = site.head("/privacy")
    assert response.status_code == 200 and response.headers["cache-control"] == "no-cache"


def test_what_is_written_into_the_page_is_escaped():
    page = seo.page_html(INDEX.read_text(), "privacy", 'https://x.example/"><script>')
    assert '"><script>' not in page
    assert 'href="https://x.example/&quot;&gt;&lt;script&gt;/privacy"' in page
