"""The site's cookies are the two the privacy page lists, and no other.

Both are needed for signing in, so there is no consent banner: a new
cookie, say for statistics, has to be added to the page (and may need one).
"""

import re
from pathlib import Path

from app.api.auth import LOGIN_COOKIE, REFRESH_COOKIE

APP = Path(__file__).resolve().parents[1] / "app"
PRIVACY_PAGE = Path(__file__).resolve().parents[2] / "frontend" / "src" / "pages" / "PrivacyPage.tsx"


def test_the_server_sets_only_the_sign_in_cookies():
    names = set()
    for source in APP.rglob("*.py"):
        names |= set(re.findall(r"\.set_cookie\(\s*([A-Za-z_\"']+)", source.read_text()))
    assert names == {"LOGIN_COOKIE", "REFRESH_COOKIE"}


def test_the_privacy_page_names_each_cookie():
    page = PRIVACY_PAGE.read_text()
    for name in (LOGIN_COOKIE, REFRESH_COOKIE):
        assert name in page, name
