"""Sign-in endpoints.

- GET  /auth/{provider}/login     redirect to Microsoft or Google
- GET  /auth/{provider}/callback  the provider sends the browser back here
- POST /auth/refresh              cookie -> new access token (and new cookie)
- POST /auth/logout               end this device's session
- POST /auth/logout-all           end every session of the user
- GET  /me                        who am I
- GET  /auth/providers            which sign-in buttons to show
- POST /auth/demo/login           demo sign-in, only when DEMO_LOGIN_ENABLED
"""

import hmac
import secrets
from datetime import datetime, timedelta
from typing import Annotated
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.accounts import sign_in
from app.api.deps import get_session
from app.auth import get_current_user
from app.clock import get_now
from app.config import Settings, get_settings
from app.demo import demo_still_allowed, demo_user
from app.errors import Refusal
from app.models import AuthSession, Institution, User
from app.oidc import Provider, configured_providers, new_pkce_pair
from app.ratelimit import refresh_limit, sign_in_limit
from app.schemas import DemoLoginIn, MeOut, ProvidersOut, TokenOut
from app.sessions import (
    ACCESS_TOKEN_LIFETIME,
    SESSION_LIFETIME,
    access_token,
    revoke,
    revoke_all,
    rotate,
    start_session,
)

router = APIRouter(tags=["auth"])

LOGIN_COOKIE = "studyspot_login"
REFRESH_COOKIE = "studyspot_refresh"
LOGIN_LIFETIME = timedelta(minutes=10)

SessionDep = Annotated[Session, Depends(get_session)]
NowDep = Annotated[datetime, Depends(get_now)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


_http = httpx.Client()


def get_http_client() -> httpx.Client:
    return _http


_providers: dict[int, dict[str, Provider]] = {}


def get_providers(settings: SettingsDep) -> dict[str, Provider]:
    """Built once per settings object, so each provider's JWKS cache lives on."""
    key = id(settings)
    if key not in _providers:
        _providers[key] = configured_providers(settings)
    return _providers[key]


def _provider(name: str, providers: dict[str, Provider]) -> Provider:
    provider = providers.get(name)
    if provider is None:
        raise HTTPException(404, "provider_not_available")
    return provider


def _callback_url(settings: Settings, provider: str) -> str:
    return f"{settings.public_api_url.rstrip('/')}/auth/{provider}/callback"


def _require_allowed_origin(request: Request, settings: Settings) -> None:
    """CSRF guard for the endpoints that act on the refresh cookie: a page on
    another site could make the browser send the cookie, but not fake Origin."""
    origin = request.headers.get("origin", "").rstrip("/")
    if origin not in settings.allowed_origins():
        raise HTTPException(403, "origin_not_allowed")


def _set_refresh_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=int(SESSION_LIFETIME.total_seconds()),
        path=settings.auth_cookie_path(),
        httponly=True,  # page scripts cannot read it, so XSS cannot steal it
        secure=settings.cookie_secure,
        samesite="lax",
    )


def _clear_refresh_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        REFRESH_COOKIE, path=settings.auth_cookie_path(), httponly=True, secure=settings.cookie_secure, samesite="lax"
    )


def _to_frontend(settings: Settings, error: str | None = None) -> RedirectResponse:
    target = f"{settings.frontend_url.rstrip('/')}/signed-in"
    if error is not None:
        target += "?" + urlencode({"error": error})
    return RedirectResponse(target, status_code=status.HTTP_303_SEE_OTHER)


@router.get("/auth/providers", response_model=ProvidersOut)
def list_providers(
    settings: SettingsDep, providers: Annotated[dict[str, Provider], Depends(get_providers)]
):
    return ProvidersOut(providers=sorted(providers), demo=settings.demo_login_enabled)


@router.post("/auth/demo/login", response_model=TokenOut, dependencies=[Depends(sign_in_limit)])
def demo_login(
    body: DemoLoginIn,
    request: Request,
    response: Response,
    db: SessionDep,
    settings: SettingsDep,
    now: NowDep,
):
    if not settings.demo_login_enabled:
        raise HTTPException(404, "demo_login_disabled")
    # It sets the refresh cookie, so it gets the same CSRF guard as refresh.
    _require_allowed_origin(request, settings)
    try:
        with db.begin_nested():  # a failure below undoes only this sign-in's writes
            user = demo_user(db, settings.demo_institution, body.persona, now)
            issued = start_session(db, user, now)
    except Refusal as refusal:
        raise HTTPException(refusal.status, refusal.code) from None
    except IntegrityError:
        # Two first sign-ins of the same persona at once: one created the user.
        raise HTTPException(409, "concurrent_sign_in") from None
    if not demo_still_allowed(db, user, settings):
        revoke_all(db, user.id, now)
        db.commit()
        _clear_refresh_cookie(response, settings)
        raise HTTPException(401, "demo_ended", headers=dict(response.headers))
    db.commit()
    _set_refresh_cookie(response, issued.refresh_token, settings)
    return _token_out(db, user, issued.session, now, settings)


@router.get("/auth/{provider_name}/login", dependencies=[Depends(sign_in_limit)])
def login(
    provider_name: str,
    settings: SettingsDep,
    now: NowDep,
    providers: Annotated[dict[str, Provider], Depends(get_providers)],
):
    provider = _provider(provider_name, providers)
    state, nonce = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    verifier, challenge = new_pkce_pair()
    # The values to check on the way back travel in a short signed cookie,
    # so no server-side storage is needed for an unfinished sign-in.
    pending = jwt.encode(
        {
            "provider": provider_name,
            "state": state,
            "nonce": nonce,
            "verifier": verifier,
            "exp": int((now + LOGIN_LIFETIME).timestamp()),
        },
        settings.jwt_secret_bytes(),
        algorithm="HS256",
    )
    response = RedirectResponse(
        provider.authorization_url(_callback_url(settings, provider_name), state, nonce, challenge),
        status_code=status.HTTP_302_FOUND,
    )
    response.set_cookie(
        LOGIN_COOKIE,
        pending,
        max_age=int(LOGIN_LIFETIME.total_seconds()),
        path=settings.auth_cookie_path(),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",  # sent on the provider's top-level redirect back to us
    )
    return response


@router.get("/auth/{provider_name}/callback", dependencies=[Depends(sign_in_limit)])
def callback(
    provider_name: str,
    db: SessionDep,
    settings: SettingsDep,
    now: NowDep,
    providers: Annotated[dict[str, Provider], Depends(get_providers)],
    http: Annotated[httpx.Client, Depends(get_http_client)],
    code: Annotated[str | None, Query(max_length=4096)] = None,
    state: Annotated[str | None, Query(max_length=256)] = None,
    pending: Annotated[str | None, Cookie(alias=LOGIN_COOKIE)] = None,
):
    provider = _provider(provider_name, providers)
    try:
        expected = _read_pending(pending, provider_name, now, settings)
        if code is None or state is None or not hmac.compare_digest(state, expected["state"]):
            raise Refusal(400, "invalid_state")
        id_token = provider.exchange_code(
            http, code, _callback_url(settings, provider_name), expected["verifier"]
        )
        claims = provider.verify_id_token(http, id_token, expected["nonce"])
        try:
            with db.begin_nested():  # a refusal below undoes only this sign-in's writes
                user = sign_in(db, provider, provider.identity(claims), now, settings.open_sign_in_institution)
                issued = start_session(db, user, now)
        except IntegrityError:
            # The same first sign-in finished in another tab a moment ago.
            raise Refusal(409, "concurrent_sign_in") from None
        db.commit()
    except Refusal as refusal:
        response = _to_frontend(settings, refusal.code)
    else:
        response = _to_frontend(settings)
        _set_refresh_cookie(response, issued.refresh_token, settings)
    response.delete_cookie(LOGIN_COOKIE, path=settings.auth_cookie_path(), secure=settings.cookie_secure)
    return response


def _read_pending(pending: str | None, provider_name: str, now: datetime, settings: Settings):
    if pending is None:
        raise Refusal(400, "invalid_state")
    try:
        claims = jwt.decode(
            pending,
            settings.jwt_secret_bytes(),
            algorithms=["HS256"],
            options={"require": ["exp"], "verify_exp": False},
        )
    except jwt.PyJWTError:
        raise Refusal(400, "invalid_state") from None
    if claims["exp"] <= now.timestamp() or claims.get("provider") != provider_name:
        raise Refusal(400, "invalid_state")
    return claims


@router.post("/auth/refresh", response_model=TokenOut, dependencies=[Depends(refresh_limit)])
def refresh(
    request: Request,
    response: Response,
    db: SessionDep,
    settings: SettingsDep,
    now: NowDep,
    token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
):
    _require_allowed_origin(request, settings)
    if token is None:
        raise HTTPException(401, "invalid_session")
    try:
        user, issued = rotate(db, token, now)
    except Refusal as refusal:
        db.commit()  # keep a theft-triggered revoke-all
        # session_rotated: another tab just swapped this cookie for a new one,
        # which the browser already holds. Clearing it would sign both out.
        if refusal.code != "session_rotated":
            _clear_refresh_cookie(response, settings)
        raise HTTPException(refusal.status, refusal.code, headers=dict(response.headers)) from None
    if not demo_still_allowed(db, user, settings):
        revoke_all(db, user.id, now)
        db.commit()
        _clear_refresh_cookie(response, settings)
        raise HTTPException(401, "demo_ended", headers=dict(response.headers))
    db.commit()
    _set_refresh_cookie(response, issued.refresh_token, settings)
    return _token_out(db, user, issued.session, now, settings)


def _token_out(db: Session, user: User, session: AuthSession, now: datetime, settings: Settings) -> TokenOut:
    return TokenOut(
        access_token=access_token(user, session, now, settings.jwt_secret_bytes()),
        token_type="bearer",
        expires_in=int(ACCESS_TOKEN_LIFETIME.total_seconds()),
        user=_me(db, user),
    )


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    db: SessionDep,
    settings: SettingsDep,
    now: NowDep,
    token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
):
    _require_allowed_origin(request, settings)
    if token is not None:
        revoke(db, token, now)
        db.commit()
    _clear_refresh_cookie(response, settings)


@router.post("/auth/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all(
    response: Response,
    user: Annotated[User, Depends(get_current_user)],
    db: SessionDep,
    settings: SettingsDep,
    now: NowDep,
):
    revoke_all(db, user.id, now)
    db.commit()
    _clear_refresh_cookie(response, settings)


@router.get("/me", response_model=MeOut)
def me(user: Annotated[User, Depends(get_current_user)], db: SessionDep):
    return _me(db, user)


def _me(db: Session, user: User) -> MeOut:
    institution = db.get(Institution, user.institution_id)
    return MeOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        institution_slug=institution.slug,
    )
