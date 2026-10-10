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
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse

from app.main import app as api
from app.main import lifespan

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
ONE_WEEK = "public, max-age=604800"


def create_site(static_dir: Path, api_docs: bool = False) -> FastAPI:
    root = static_dir.resolve()
    index = root / "index.html"
    # The API's own lifespan (the background sweep) runs with this app: a
    # mounted app's lifespan is not started by Starlette.
    site = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    @site.middleware("http")
    async def security_headers(request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers.update(SECURITY_HEADERS)
        return response

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

    # HEAD too: uptime monitors and `curl -I` ask that way.
    @site.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def web_app(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404)  # an API address the API did not take
        try:
            file = (root / path).resolve()
            # Never outside the build folder, whatever the address says.
            found = bool(path) and file.is_relative_to(root) and file.is_file()
        except (ValueError, OSError):  # a NUL byte, a name too long for the disk
            raise HTTPException(404) from None
        if found:
            return FileResponse(file, headers={"Cache-Control": ONE_YEAR if path.startswith("assets/") else ONE_WEEK})
        if "." in path.rsplit("/", 1)[-1]:
            raise HTTPException(404)  # a missing file, not a page of the app
        # Every other address is a page of the web app; its router decides.
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

    return site


app = create_site(Path(os.environ.get("STATIC_DIR", "../frontend/dist")))
