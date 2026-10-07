"""OpenID Connect sign-in with Microsoft and Google.

Flow (Authorization Code with PKCE):
1. We redirect the browser to the provider with a random state, nonce and
   PKCE challenge.
2. The provider redirects back with a one-time code.
3. We exchange the code (plus our client secret and the PKCE verifier) for
   an ID token, and verify it: signature against the provider's published
   keys (JWKS), audience, expiry, issuer and nonce.

Who the user is comes from stable, signed claims, never from the email:
Microsoft "tid" + "oid", Google "sub". Which institution they belong to
comes from Microsoft's "tid" or Google's verified Workspace domain "hd".
"""

import base64
import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlencode

import httpx
import jwt

from app.errors import Refusal
from app.models import AuthProvider

ID_TOKEN_ALGORITHMS = ["RS256"]  # fixed here, never taken from the token
CLOCK_SKEW_SECONDS = 60
JWKS_TTL_SECONDS = 3600


@dataclass(frozen=True)
class ProviderIdentity:
    subject: str  # stored in user_identities
    institution_key: str | None  # matched against institution_login_rules
    email: str
    display_name: str


@dataclass
class _KeyCache:
    keys: jwt.PyJWKSet | None = None
    fetched_at: float = 0.0


@dataclass
class Provider:
    client_id: str
    client_secret: str
    authorize_url: str
    token_url: str
    jwks_url: str
    scope: str = "openid email profile"
    _cache: _KeyCache = field(default_factory=_KeyCache, repr=False)

    name: AuthProvider = AuthProvider.MICROSOFT  # overridden by subclasses

    # --- Per-provider rules ---------------------------------------------------

    def expected_issuer(self, claims: dict[str, Any]) -> str:
        raise NotImplementedError

    def identity(self, claims: dict[str, Any]) -> ProviderIdentity:
        raise NotImplementedError

    # --- Shared flow ------------------------------------------------------------

    def authorization_url(self, redirect_uri: str, state: str, nonce: str, challenge: str) -> str:
        query = {
            "client_id": self.client_id,
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "scope": self.scope,
            "state": state,
            "nonce": nonce,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "prompt": "select_account",
        }
        return f"{self.authorize_url}?{urlencode(query)}"

    def exchange_code(self, http: httpx.Client, code: str, redirect_uri: str, verifier: str) -> str:
        try:
            response = http.post(
                self.token_url,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "code_verifier": verifier,
                },
                timeout=10,
            )
        except httpx.HTTPError:
            raise Refusal(502, "token_exchange_failed") from None
        try:
            body = response.json() if response.status_code == 200 else {}
        except ValueError:
            body = {}
        token = body.get("id_token") if isinstance(body, dict) else None
        if not isinstance(token, str):
            raise Refusal(401, "token_exchange_failed")
        return token

    def verify_id_token(self, http: httpx.Client, token: str, nonce: str) -> dict[str, Any]:
        try:
            key = self._signing_key(http, jwt.get_unverified_header(token).get("kid"))
            claims = jwt.decode(
                token,
                key.key,
                algorithms=ID_TOKEN_ALGORITHMS,
                audience=self.client_id,
                leeway=CLOCK_SKEW_SECONDS,
                options={"require": ["iss", "aud", "exp", "iat", "sub", "nonce"]},
            )
        except (jwt.PyJWTError, KeyError, ValueError):
            raise Refusal(401, "invalid_id_token") from None
        if not hmac.compare_digest(str(claims["iss"]), self.expected_issuer(claims)):
            raise Refusal(401, "invalid_id_token")
        if not hmac.compare_digest(str(claims["nonce"]), nonce):
            raise Refusal(401, "invalid_id_token")
        return claims

    def _signing_key(self, http: httpx.Client, kid: str | None) -> jwt.PyJWK:
        if kid is None:
            raise KeyError("no kid")
        stale = time.monotonic() - self._cache.fetched_at > JWKS_TTL_SECONDS
        if self._cache.keys is None or stale:
            self._refresh_keys(http)
        try:
            return self._cache.keys[kid]
        except KeyError:
            # The provider may have rotated its keys since we cached them.
            self._refresh_keys(http)
            return self._cache.keys[kid]

    def _refresh_keys(self, http: httpx.Client) -> None:
        try:
            response = http.get(self.jwks_url, timeout=10)
            response.raise_for_status()
        except httpx.HTTPError:
            raise Refusal(502, "provider_unavailable") from None
        self._cache.keys = jwt.PyJWKSet.from_dict(response.json())
        self._cache.fetched_at = time.monotonic()


@dataclass
class MicrosoftProvider(Provider):
    """Work and school accounts only (the "organizations" endpoint)."""

    name: AuthProvider = AuthProvider.MICROSOFT

    def expected_issuer(self, claims: dict[str, Any]) -> str:
        # Each tenant signs with its own issuer; it must match the token's tid.
        return f"https://login.microsoftonline.com/{claims.get('tid', '')}/v2.0"

    def identity(self, claims: dict[str, Any]) -> ProviderIdentity:
        tid, oid = str(claims.get("tid", "")).lower(), str(claims.get("oid", ""))
        if not tid or not oid:
            raise Refusal(401, "invalid_id_token")
        email = str(claims.get("email") or claims.get("preferred_username") or "")
        return ProviderIdentity(
            subject=f"{tid}:{oid}",
            institution_key=tid,
            email=_clean_email(email),
            display_name=_clean_name(claims.get("name"), email),
        )


@dataclass
class GoogleProvider(Provider):
    name: AuthProvider = AuthProvider.GOOGLE

    def expected_issuer(self, claims: dict[str, Any]) -> str:
        # Google documents both forms of its issuer.
        issuer = str(claims.get("iss", ""))
        return issuer if issuer in ("https://accounts.google.com", "accounts.google.com") else "-"

    def identity(self, claims: dict[str, Any]) -> ProviderIdentity:
        email = str(claims.get("email", "")).lower()
        verified = claims.get("email_verified") is True
        # "hd" is present only for Google Workspace accounts; a personal
        # gmail account has none and therefore belongs to no institution.
        domain = str(claims.get("hd", "")).lower() if verified else ""
        return ProviderIdentity(
            subject=str(claims["sub"]),
            institution_key=domain or None,
            email=_clean_email(email),
            display_name=_clean_name(claims.get("name"), email),
        )


def _clean_email(value: str) -> str:
    """Shown to the user only; trimmed to fit the column."""
    return value.strip().lower()[:320]


def _clean_name(name: object, email: str) -> str:
    text = str(name or "").strip() or email.split("@")[0].strip() or "Student"
    return text[:100]


def new_pkce_pair() -> tuple[str, str]:
    """(verifier, challenge): the challenge is base64url(SHA-256(verifier))."""
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode()).digest()
    return verifier, base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def configured_providers(settings) -> dict[str, Provider]:
    """Providers that have a client id and secret. The others are switched off."""
    providers: dict[str, Provider] = {}
    if settings.microsoft_client_id and settings.microsoft_client_secret:
        base = "https://login.microsoftonline.com/organizations"
        providers["microsoft"] = MicrosoftProvider(
            client_id=settings.microsoft_client_id,
            client_secret=settings.microsoft_client_secret.get_secret_value(),
            authorize_url=f"{base}/oauth2/v2.0/authorize",
            token_url=f"{base}/oauth2/v2.0/token",
            jwks_url=f"{base}/discovery/v2.0/keys",
        )
    if settings.google_client_id and settings.google_client_secret:
        providers["google"] = GoogleProvider(
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret.get_secret_value(),
            authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
            token_url="https://oauth2.googleapis.com/token",
            jwks_url="https://www.googleapis.com/oauth2/v3/certs",
        )
    return providers
