"""Sign-in end to end, against a fake identity provider that exists only here.

The fake provider is an RSA key made in the test, a JWKS document and a
token endpoint served through httpx.MockTransport. The application code
is the real code: there is no test-only shortcut in it.
"""

import time
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import httpx
import jwt
import pytest
from conftest import SUNDAY_10AM
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.api.auth import get_http_client, get_providers
from app.api.deps import get_session
from app.clock import get_now
from app.config import Settings, get_settings
from app.main import app
from app.models import User, UserIdentity
from app.oidc import GoogleProvider, MicrosoftProvider
from app.seed.braude import STUDENTS_TENANT

CLIENT_ID = "studyspot-test-client"
OTHER_TENANT = "11111111-2222-3333-4444-555555555555"
FRONTEND = "https://app.example"


class FakeProvider:
    """Signs ID tokens and answers the token and JWKS endpoints."""

    def __init__(self):
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.kid = "test-key-1"
        self.next_claims: dict = {}
        self.sign_with = self.key
        self.token_status = 200

    def jwks(self) -> dict:
        public = jwt.algorithms.RSAAlgorithm.to_jwk(self.key.public_key(), as_dict=True)
        return {"keys": [{**public, "kid": self.kid, "use": "sig", "alg": "RS256"}]}

    def id_token(self) -> str:
        now = int(time.time())
        claims = {"aud": CLIENT_ID, "iat": now, "exp": now + 600, **self.next_claims}
        return jwt.encode(claims, self.sign_with, algorithm="RS256", headers={"kid": self.kid})

    def handle(self, request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/keys"):
            return httpx.Response(200, json=self.jwks())
        if request.url.path.endswith("/token"):
            if self.token_status != 200:
                return httpx.Response(self.token_status, json={"error": "invalid_grant"})
            return httpx.Response(200, json={"id_token": self.id_token(), "token_type": "Bearer"})
        return httpx.Response(404)


@pytest.fixture
def fake() -> FakeProvider:
    return FakeProvider()


@pytest.fixture
def auth_client(session, braude, fake):
    """A browser-like client (HTTPS, keeps cookies) with no signed-in user."""
    settings = Settings(
        database_url="postgresql+psycopg://unused@localhost/unused",
        jwt_secret="test-jwt-secret-that-is-long-enough-0123456789",
        public_api_url="https://testserver",
        frontend_url=FRONTEND,
        _env_file=None,
    )
    providers = {
        "microsoft": MicrosoftProvider(
            client_id=CLIENT_ID, client_secret="secret",
            authorize_url="https://login.fake/organizations/oauth2/v2.0/authorize",
            token_url="https://login.fake/organizations/oauth2/v2.0/token",
            jwks_url="https://login.fake/organizations/discovery/v2.0/keys",
        ),
        "google": GoogleProvider(
            client_id=CLIENT_ID, client_secret="secret",
            authorize_url="https://accounts.fake/o/oauth2/v2/auth",
            token_url="https://oauth2.fake/token",
            jwks_url="https://www.fake/oauth2/v3/keys",
        ),
    }
    http = httpx.Client(transport=httpx.MockTransport(fake.handle))
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_now] = lambda: SUNDAY_10AM
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_providers] = lambda: providers
    app.dependency_overrides[get_http_client] = lambda: http
    client = TestClient(app, base_url="https://testserver", headers={"Origin": FRONTEND})
    yield client
    app.dependency_overrides.clear()


def microsoft_claims(tenant=STUDENTS_TENANT, oid="oid-1", **extra) -> dict:
    return {
        "iss": f"https://login.microsoftonline.com/{tenant}/v2.0",
        "sub": "pairwise-sub", "tid": tenant, "oid": oid,
        "preferred_username": "Itay.Gabay@e.braude.ac.il", "name": "Itay Gabay",
        **extra,
    }


def start_login(client, provider="microsoft") -> dict:
    response = client.get(f"/auth/{provider}/login", follow_redirects=False)
    assert response.status_code == 302
    return {k: v[0] for k, v in parse_qs(urlparse(response.headers["location"]).query).items()}


def finish_login(client, fake, claims: dict, provider="microsoft", state=None, nonce=None):
    params = start_login(client, provider)
    fake.next_claims = {"nonce": nonce or params["nonce"], **claims}
    return client.get(
        f"/auth/{provider}/callback",
        params={"code": "auth-code", "state": state or params["state"]},
        follow_redirects=False,
    )


def redirect_error(response) -> str | None:
    assert response.status_code == 303
    query = parse_qs(urlparse(response.headers["location"]).query)
    return query.get("error", [None])[0]


def sign_in(client, fake, **claims) -> str:
    """Complete a sign-in and return a fresh access token."""
    response = finish_login(client, fake, microsoft_claims(**claims))
    assert redirect_error(response) is None
    refreshed = client.post("/auth/refresh")
    assert refreshed.status_code == 200, refreshed.json()
    return refreshed.json()["access_token"]


def users_count(session) -> int:
    return session.scalar(select(func.count()).select_from(User))


# --- The redirect to the provider ----------------------------------------------------


def test_login_redirect_has_state_nonce_and_pkce(auth_client):
    params = start_login(auth_client)
    assert params["client_id"] == CLIENT_ID
    assert params["response_type"] == "code"
    assert params["code_challenge_method"] == "S256"
    assert params["redirect_uri"] == "https://testserver/auth/microsoft/callback"
    assert len(params["state"]) >= 32 and len(params["nonce"]) >= 32
    assert len(params["code_challenge"]) == 43


def test_unknown_provider_is_404(auth_client):
    # A lambda, not `dict`: FastAPI reads the override's signature, and dict has none.
    app.dependency_overrides[get_providers] = lambda: {}  # noqa: PIE807
    assert auth_client.get("/auth/microsoft/login", follow_redirects=False).status_code == 404


# --- A successful sign-in ------------------------------------------------------------------


def test_braude_student_signs_in(auth_client, fake, session, braude):
    token = sign_in(auth_client, fake)
    me = auth_client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    body = me.json()
    assert (body["institution_slug"], body["role"]) == ("braude", "student")
    assert body["email"] == "itay.gabay@e.braude.ac.il"
    identity = session.scalars(select(UserIdentity)).one()
    assert identity.subject == f"{STUDENTS_TENANT}:oid-1"


def test_signing_in_again_reuses_the_user(auth_client, fake, session):
    sign_in(auth_client, fake)
    before = users_count(session)
    sign_in(auth_client, fake)
    assert users_count(session) == before


def test_callback_sets_an_http_only_refresh_cookie(auth_client, fake):
    response = finish_login(auth_client, fake, microsoft_claims())
    assert response.headers["location"].startswith(FRONTEND)
    cookie = next(c for c in response.headers.get_list("set-cookie") if "studyspot_refresh=" in c)
    lowered = cookie.lower()
    assert "httponly" in lowered and "secure" in lowered and "samesite=lax" in lowered
    assert "path=/auth" in lowered


# --- Refused sign-ins -------------------------------------------------------------------------


def test_wrong_state_is_refused(auth_client, fake):
    response = finish_login(auth_client, fake, microsoft_claims(), state="x" * 43)
    assert redirect_error(response) == "invalid_state"


def test_wrong_nonce_is_refused(auth_client, fake):
    response = finish_login(auth_client, fake, microsoft_claims(), nonce="y" * 43)
    assert redirect_error(response) == "invalid_id_token"


@pytest.mark.parametrize(
    "change",
    [
        {"aud": "someone-else"},
        {"exp": int(time.time()) - 3600},
        {"iss": "https://evil.example/v2.0"},
        {"iss": f"https://login.microsoftonline.com/{OTHER_TENANT}/v2.0"},  # iss/tid mismatch
    ],
)
def test_bad_id_token_claims_are_refused(auth_client, fake, change):
    response = finish_login(auth_client, fake, {**microsoft_claims(), **change})
    assert redirect_error(response) == "invalid_id_token"


def test_token_signed_by_another_key_is_refused(auth_client, fake):
    fake.sign_with = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    response = finish_login(auth_client, fake, microsoft_claims())
    assert redirect_error(response) == "invalid_id_token"


def test_failed_code_exchange_is_refused(auth_client, fake):
    fake.token_status = 400
    response = finish_login(auth_client, fake, microsoft_claims())
    assert redirect_error(response) == "token_exchange_failed"


def test_unknown_tenant_is_refused_and_creates_nobody(auth_client, fake, session):
    before = users_count(session)
    response = finish_login(auth_client, fake, microsoft_claims(tenant=OTHER_TENANT))
    assert redirect_error(response) == "institution_not_supported"
    assert users_count(session) == before


def test_braude_email_from_a_foreign_tenant_is_refused(auth_client, fake):
    """nOAuth: an attacker's own tenant can carry any email. Only the tid counts."""
    claims = microsoft_claims(tenant=OTHER_TENANT, email="dalitc@braude.ac.il")
    response = finish_login(auth_client, fake, claims)
    assert redirect_error(response) == "institution_not_supported"


@pytest.mark.parametrize(
    "claims",
    [
        {"email": "someone@gmail.com", "email_verified": True},  # no hd: personal account
        {"email": "a@braude.ac.il", "email_verified": False, "hd": "braude.ac.il"},
    ],
)
def test_google_without_a_verified_workspace_domain_is_refused(auth_client, fake, claims):
    google = {"iss": "https://accounts.google.com", "sub": "g-1", "name": "G", **claims}
    response = finish_login(auth_client, fake, google, provider="google")
    assert redirect_error(response) == "institution_not_supported"


# --- Sessions -------------------------------------------------------------------------------------


def test_refresh_rotates_the_cookie(auth_client, fake):
    sign_in(auth_client, fake)
    first = auth_client.cookies.get("studyspot_refresh", path="/auth")
    assert auth_client.post("/auth/refresh").status_code == 200
    second = auth_client.cookies.get("studyspot_refresh", path="/auth")
    assert first != second


def test_reusing_an_old_refresh_token_revokes_every_session(auth_client, fake):
    sign_in(auth_client, fake)
    stolen = auth_client.cookies.get("studyspot_refresh", path="/auth")
    auth_client.post("/auth/refresh")  # the real owner refreshes: stolen is now old
    owners = auth_client.cookies.get("studyspot_refresh", path="/auth")
    assert owners != stolen

    def send_only(token: str):
        auth_client.cookies.clear()
        auth_client.cookies.set("studyspot_refresh", token, domain="testserver.local", path="/auth")
        return auth_client.post("/auth/refresh")

    app.dependency_overrides[get_now] = lambda: SUNDAY_10AM + timedelta(minutes=5)
    assert send_only(stolen).status_code == 401  # the thief replays the old token...
    assert send_only(owners).status_code == 401  # ...and that ended the owner's session too


def test_logout_all_blocks_access_tokens_immediately(auth_client, fake):
    token = sign_in(auth_client, fake)
    headers = {"Authorization": f"Bearer {token}"}
    assert auth_client.get("/me", headers=headers).status_code == 200
    assert auth_client.post("/auth/logout-all", headers=headers).status_code == 204
    assert auth_client.get("/me", headers=headers).status_code == 401
    assert auth_client.post("/auth/refresh").status_code == 401


def test_logout_ends_this_session(auth_client, fake):
    sign_in(auth_client, fake)
    assert auth_client.post("/auth/logout").status_code == 204
    assert auth_client.post("/auth/refresh").status_code == 401


def test_cookie_requests_from_a_foreign_origin_are_refused(auth_client, fake):
    sign_in(auth_client, fake)
    response = auth_client.post("/auth/refresh", headers={"Origin": "https://evil.example"})
    assert (response.status_code, response.json()["detail"]) == (403, "origin_not_allowed")
    no_origin = auth_client.post("/auth/refresh", headers={"Origin": ""})
    assert no_origin.status_code == 403


def test_access_token_expires(auth_client, fake):
    token = sign_in(auth_client, fake)
    app.dependency_overrides[get_now] = lambda: SUNDAY_10AM + timedelta(minutes=16)
    assert auth_client.get("/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_tampered_or_missing_access_token_is_refused(auth_client, fake):
    token = sign_in(auth_client, fake)
    assert auth_client.get("/me").status_code == 401
    forged = jwt.encode({"sub": "1", "sid": 1}, "not-the-secret-but-long-enough-0123456789", algorithm="HS256")
    assert auth_client.get("/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401
    unsigned = jwt.encode(jwt.decode(token, options={"verify_signature": False}), None, algorithm="none")
    assert auth_client.get("/me", headers={"Authorization": f"Bearer {unsigned}"}).status_code == 401


def test_two_tabs_refreshing_together_is_not_theft(auth_client, fake):
    """Within the grace window, a just-rotated token is refused without revoking."""
    sign_in(auth_client, fake)
    shared = auth_client.cookies.get("studyspot_refresh", path="/auth")
    first_tab = auth_client.post("/auth/refresh")
    assert first_tab.status_code == 200
    current = auth_client.cookies.get("studyspot_refresh", path="/auth")

    auth_client.cookies.clear()
    auth_client.cookies.set("studyspot_refresh", shared, domain="testserver.local", path="/auth")
    second_tab = auth_client.post("/auth/refresh")
    assert (second_tab.status_code, second_tab.json()["detail"]) == (401, "session_rotated")
    # The browser shares one cookie jar between tabs: the second tab's
    # answer must not delete the new cookie the first tab just received.
    assert "studyspot_refresh" not in second_tab.headers.get("set-cookie", "")

    auth_client.cookies.clear()
    auth_client.cookies.set("studyspot_refresh", current, domain="testserver.local", path="/auth")
    assert auth_client.post("/auth/refresh").status_code == 200  # still signed in


def test_blank_name_and_long_email_from_the_provider_are_cleaned(auth_client, fake, session):
    long_email = "a" * 400 + "@e.braude.ac.il"
    response = finish_login(auth_client, fake, microsoft_claims(name="   ", preferred_username=long_email))
    assert redirect_error(response) is None
    user = session.scalars(select(User)).one()
    assert user.display_name.strip() and len(user.email) <= 320


def test_non_json_token_response_is_refused_cleanly(auth_client, fake):
    original = fake.handle

    def html_page(request):
        if request.url.path.endswith("/token"):
            return httpx.Response(200, text="<html>proxy error</html>")
        return original(request)

    fake.handle = html_page
    app.dependency_overrides[get_http_client] = lambda: httpx.Client(
        transport=httpx.MockTransport(html_page)
    )
    response = finish_login(auth_client, fake, microsoft_claims())
    assert redirect_error(response) == "token_exchange_failed"


# --- An open campus: any Google account, as a student ------------------------
# The live demo lets visitors sign in with their own account, so each has
# their own bookings. Only an institution with no sign-in rules can be open:
# Braude can never be reached this way.


def personal_google(sub="g-personal-1", **extra) -> dict:
    return {"iss": "https://accounts.google.com", "sub": sub, "name": "Visitor", "email": "visitor@gmail.com", "email_verified": True, **extra}


@pytest.fixture
def open_campus(session, auth_client):
    from app.models import Institution

    demo = Institution(name="קמפוס הדגמה", slug="demo")
    session.add(demo)
    session.flush()
    settings = app.dependency_overrides[get_settings]()
    open_settings = settings.model_copy(update={"open_sign_in_institution": "demo"})
    app.dependency_overrides[get_settings] = lambda: open_settings
    return demo


def test_a_personal_google_account_joins_the_open_campus_as_a_student(auth_client, fake, session, open_campus):
    from app.models import UserRole

    response = finish_login(auth_client, fake, personal_google(), provider="google")
    assert redirect_error(response) is None
    user = session.scalars(select(User).where(User.email == "visitor@gmail.com")).one()
    assert user.institution_id == open_campus.id
    assert user.role == UserRole.STUDENT


def test_two_visitors_are_two_users(auth_client, fake, session, open_campus):
    finish_login(auth_client, fake, personal_google(sub="g-a", email="a@gmail.com"), provider="google")
    finish_login(auth_client, fake, personal_google(sub="g-b", email="b@gmail.com"), provider="google")
    emails = set(session.scalars(select(User.email).where(User.institution_id == open_campus.id)))
    assert emails == {"a@gmail.com", "b@gmail.com"}


def test_an_institution_with_sign_in_rules_is_never_open(auth_client, fake, session, braude):
    # Pointed at Braude by mistake: refused, and nobody is created.
    settings = app.dependency_overrides[get_settings]()
    app.dependency_overrides[get_settings] = lambda: settings.model_copy(update={"open_sign_in_institution": braude.slug})
    before = users_count(session)
    response = finish_login(auth_client, fake, personal_google(), provider="google")
    assert redirect_error(response) == "institution_not_supported"
    assert users_count(session) == before


def test_a_braude_sign_in_still_goes_to_braude_when_a_campus_is_open(auth_client, fake, session, braude, open_campus):
    sign_in(auth_client, fake)
    user = session.scalars(select(User).order_by(User.id.desc())).first()
    assert user.institution_id == braude.id


def test_no_open_campus_unless_configured(auth_client, fake):
    response = finish_login(auth_client, fake, personal_google(), provider="google")
    assert redirect_error(response) == "institution_not_supported"


# --- Deleting one's own account ------------------------------------------------
# The privacy page promises that anyone can delete their account themselves:
# the user and everything that is theirs, and nothing of anyone else's.


def test_a_user_deletes_their_account_and_everything_that_is_theirs(auth_client, fake, session, braude):
    from conftest import place_named

    from app.models import AuthSession, Booking, BookingSource, BookingStatus, Place, UserIdentity

    token = sign_in(auth_client, fake)
    headers = {"Authorization": f"Bearer {token}"}
    me = auth_client.get("/me", headers=headers).json()
    room: Place = place_named(braude, "EM", "EM107")
    session.add(Booking(user_id=me["id"], institution_id=braude.id, place_id=room.id, starts_at=SUNDAY_10AM + timedelta(days=1), ends_at=SUNDAY_10AM + timedelta(days=1, hours=1), source=BookingSource.ADVANCE, status=BookingStatus.BOOKED))
    session.flush()
    someone_else = User(institution_id=braude.id, email="other@braude.example", display_name="Other")
    session.add(someone_else)
    session.flush()

    response = auth_client.post("/me/delete", headers=headers)
    assert response.status_code == 204
    assert "studyspot_refresh" in response.headers.get("set-cookie", "")  # cleared
    session.expire_all()
    assert session.get(User, me["id"]) is None
    assert session.scalars(select(Booking).where(Booking.user_id == me["id"])).first() is None
    assert session.scalars(select(UserIdentity).where(UserIdentity.user_id == me["id"])).first() is None
    assert session.scalars(select(AuthSession).where(AuthSession.user_id == me["id"])).first() is None
    assert session.get(User, someone_else.id) is not None
    # The old token is now worth nothing.
    assert auth_client.get("/me", headers=headers).status_code == 401


def test_signing_in_after_deleting_starts_a_fresh_account(auth_client, fake, session):
    token = sign_in(auth_client, fake)
    first = auth_client.get("/me", headers={"Authorization": f"Bearer {token}"}).json()["id"]
    auth_client.post("/me/delete", headers={"Authorization": f"Bearer {token}"})
    token = sign_in(auth_client, fake)
    second = auth_client.get("/me", headers={"Authorization": f"Bearer {token}"}).json()["id"]
    assert second != first


def test_the_shared_demo_users_cannot_be_deleted(auth_client, session):
    from app.models import Institution

    session.add(Institution(name="קמפוס הדגמה", slug="demo"))
    session.flush()
    settings = app.dependency_overrides[get_settings]()
    app.dependency_overrides[get_settings] = lambda: settings.model_copy(update={"demo_login_enabled": True})
    token = auth_client.post("/auth/demo/login", json={"persona": "student"}).json()["access_token"]
    response = auth_client.post("/me/delete", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403
    assert response.json()["detail"] == "demo_account"


def test_deleting_needs_a_signed_in_user(auth_client):
    assert auth_client.post("/me/delete").status_code == 401
