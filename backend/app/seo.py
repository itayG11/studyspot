"""What a search engine reads in each public page.

The web app is one file, index.html, sent for every address; the browser then
shows the right page. A search engine that reads only that file saw the same
title, the same description and no "this is the address" link on every page,
and reported them as duplicates of one another (Search Console, 16 Nov).
So each page the sitemap lists is sent with a title, a description and a
canonical link of its own. Any other address is sent as before: it is not for
this site to say what an institution's page, or a page that does not exist,
is the same as."""

from dataclasses import dataclass
from html import escape

from app.shares import _META  # the same patterns that give a shared stay its title


@dataclass(frozen=True)
class Page:
    canonical: str  # the address this page is, without the first "/"
    title: str | None = None  # None: the title index.html already has
    description: str | None = None


# The addresses in frontend/public/sitemap.xml (a test keeps the two together).
# "" is the front address: it sends a visitor to their home institution, the
# demo campus for a new one, so it is the demo's page.
PAGES: dict[str, Page] = {
    "": Page("demo"),
    "demo": Page("demo"),
    "institutions": Page(
        "institutions",
        "מוסדות | StudySpot",
        "כל מוסד באתר StudySpot, עם הקמפוס שלו. בוחרים מוסד, ומחפשים בו מקום ללמוד.",
    ),
    "terms": Page(
        "terms",
        "תנאי שימוש | StudySpot",
        "תנאי השימוש באתר StudySpot: מה האתר, מה מותר ומה לא, והזמנות וכניסות.",
    ),
    "privacy": Page(
        "privacy",
        "מדיניות הפרטיות | StudySpot",
        "מדיניות הפרטיות של StudySpot: מה נשמר, מה לא נשמר, ומה קורה בקמפוס ההדגמה.",
    ),
    "accessibility": Page(
        "accessibility",
        "הצהרת נגישות | StudySpot",
        "הצהרת הנגישות של StudySpot: מה נבדק, מגבלות ידועות, ואיך פונים בנושא נגישות.",
    ),
    "licenses": Page(
        "licenses",
        "רישיונות | StudySpot",
        "הספריות בקוד פתוח ש-StudySpot בנוי עליהן, והרישיון של כל אחת.",
    ),
}


def page_html(index_html: str, path: str, origin: str) -> str:
    """index.html for one of PAGES. Everything put in is escaped."""
    page = PAGES[path]
    html = index_html
    if page.title and page.description:
        title, description = escape(page.title, quote=True), escape(page.description, quote=True)
        html = _META["title"].sub(lambda _: f"<title>{title}</title>", html, count=1)
        html = _META["og:title"].sub(lambda m: f"{m[1]}{title}{m[2]}", html, count=1)
        html = _META["og:description"].sub(lambda m: f"{m[1]}{description}{m[2]}", html, count=1)
        html = _META["description"].sub(lambda m: f"{m[1]}{description}{m[2]}", html, count=1)
    href = escape(f"{origin}/{page.canonical}", quote=True)
    return html.replace("<head>", f'<head>\n    <link rel="canonical" href="{href}" />', 1)
