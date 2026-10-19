"""The production server: the API under /api and the built web app, from
one address.

One address matters for signing in: the refresh cookie is then a
first-party cookie. On two addresses (say app.onrender.com and
api.onrender.com, which browsers treat as different sites) a browser that
blocks third-party cookies, like Safari, would sign the student out on
every refresh.

Run with:  STATIC_DIR=../frontend/dist uvicorn app.site:app
(the Dockerfile builds the web app and sets STATIC_DIR).
"""

import os
from datetime import datetime
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy.orm import Session
from starlette.middleware.gzip import GZipMiddleware

from app import shares
from app.api.deps import get_session
from app.api.shares import TOKEN, share_key
from app.clock import get_now
from app.config import Settings, get_settings
from app.edge import Edge, configure_logging
from app.main import app as api
from app.main import lifespan
from app.ratelimit import share_limit

# What the page may load, and from where: only this site, plus the map's
# tiles. No inline scripts, so injected HTML cannot run code. Styles set
# from scripts (Motion, Leaflet) go through the DOM, which style-src allows.
CSP = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data: blob: https://tile.openstreetmap.org https://server.arcgisonline.com",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]
)

SECURITY_HEADERS = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",  # a file is only what its type says
    "X-Frame-Options": "DENY",  # older browsers' frame-ancestors
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(self), payment=()",
    # HTTPS only, for a year. Browsers ignore it on plain http (localhost).
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
}

ONE_YEAR = "public, max-age=31536000, immutable"  # file names carry a hash
# Fixed addresses that must update at once: the push service worker.
FRESH = {"sw.js"}
ONE_WEEK = "public, max-age=604800"


def create_site(static_dir: Path, api_docs: bool = False) -> Edge:
    root = static_dir.resolve()
    index = root / "index.html"
    # Every file the build made, listed once at start: an address only looks
    # a name up here, so no path is ever built from it, and nothing outside
    # the build folder can be reached, a link pointing out of it included.
    files = {
        file.relative_to(root).as_posix(): file
        for file in root.rglob("*")
        if file.is_file() and file.resolve().is_relative_to(root)
    }
    # The API's own lifespan (the background sweep) runs with this app: a
    # mounted app's lifespan is not started by Starlette.
    site = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    if not api_docs:
        # The API's own docs page lists every route, the admin ones too, and
        # loads its scripts from a CDN that the policy above blocks anyway.
        # Off on the public site; on in development (uvicorn app.main:app).
        # These exact paths are matched before the mounted API.
        def no_docs() -> None:
            raise HTTPException(404)

        for path in ("/api/docs", "/api/docs/oauth2-redirect", "/api/redoc", "/api/openapi.json"):
            site.add_api_route(path, no_docs, methods=["GET"], include_in_schema=False)

    site.mount("/api", api)
    # Text (scripts, styles, pages, API answers) gzipped for a browser that
    # asks; Starlette leaves out what is compressed already (images, fonts)
    # and anything under 1 KB.
    site.add_middleware(GZipMiddleware, minimum_size=1024)

    # "I'm studying here" (app/shares.py): the web app's page, with a preview
    # for chat apps, which read the HTML and never run the scripts. Read per
    # request: the preview changes when the stay ends.
    index_html = index.read_text(encoding="utf-8") if index.is_file() else ""

    @site.api_route(
        "/s/{token}", methods=["GET", "HEAD"], include_in_schema=False, dependencies=[Depends(share_limit)]
    )
    def shared_stay(
        token: Annotated[str, TOKEN],
        db: Annotated[Session, Depends(get_session)],
        now: Annotated[datetime, Depends(get_now)],
        settings: Annotated[Settings, Depends(get_settings)],
    ) -> HTMLResponse:
        view = shares.view_for(db, token, now, share_key(settings))
        headers = {"Cache-Control": "no-store", "X-Robots-Tag": "noindex"}
        return HTMLResponse(shares.preview_html(index_html, view), headers=headers)

    # HEAD too: uptime monitors and `curl -I` ask that way.
    @site.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def web_app(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404)  # an API address the API did not take
        file = files.get(path)
        if file is not None:
            if path in FRESH:
                return FileResponse(file, headers={"Cache-Control": "no-cache"})
            return FileResponse(file, headers={"Cache-Control": ONE_YEAR if path.startswith("assets/") else ONE_WEEK})
        if "." in path.rsplit("/", 1)[-1]:
            raise HTTPException(404)  # a missing file, not a page of the app
        # Every other address is a page of the web app; its router decides.
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

    # Outside everything, so that a 500 from a crash has the headers too.
    return Edge(site, SECURITY_HEADERS)


configure_logging()
app = create_site(Path(os.environ.get("STATIC_DIR", "../frontend/dist")))
