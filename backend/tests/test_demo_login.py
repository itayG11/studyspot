"""Demo sign-in: a switch for development and the live demo, off by default.

It lets the site be built and shown without a Microsoft app registration.
When the switch is off the endpoint does not exist (404), so a forgotten
setting cannot open a back door in a real deployment by accident.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.api.deps import get_session
from app.clock import get_now
from app.config import Settings, get_settings
from app.main import app
from app.models import AuthProvider, User, UserIdentity, UserRole
from conftest import SUNDAY_10AM

FRONTEND = "https://app.example"


def make_settings(**overrides) -> Settings:
    return Settings(
        database_url="postgresql+psycopg://unused@localhost/unused",
        jwt_secret="test-jwt-secret-that-is-long-enough-0123456789",
        public_api_url="https://testserver",
        frontend_url=FRONTEND,
        _env_file=None,
        **overrides,
    )


@pytest.fixture
def make_client(session, braude):
    def build(**overrides) -> TestClient:
        settings = make_settings(**overrides)
        app.dependency_overrides[get_session] = lambda: session
        app.dependency_overrides[get_now] = lambda: SUNDAY_10AM
        app.dependency_overrides[get_settings] = lambda: settings
        return TestClient(app, base_url="https://testserver", headers={"Origin": FRONTEND})

    yield build
    app.dependency_overrides.clear()


@pytest.fixture
def demo_client(make_client):
    return make_client(demo_login_enabled=True)


def demo_login(client, persona="student"):
    return client.post("/auth/demo/login", json={"persona": persona})


def test_demo_login_is_off_by_default(make_client):
    assert make_settings().demo_login_enabled is False
    response = demo_login(make_client())
    assert response.status_code == 404
    assert response.json()["detail"] == "demo_login_disabled"


def test_demo_student_signs_in_to_braude(demo_client, session, braude):
    response = demo_login(demo_client)
    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["role"] == "student"
    assert body["user"]["institution_slug"] == "braude"
    me = demo_client.get("/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    user = session.get(User, body["user"]["id"])
    assert user.institution_id == braude.id


def test_demo_admin_is_an_institution_admin(demo_client):
    body = demo_login(demo_client, "admin").json()
    assert body["user"]["role"] == UserRole.INSTITUTION_ADMIN
    token = body["access_token"]
    codes = demo_client.get(
        "/admin/institutions/braude/codes", headers={"Authorization": f"Bearer {token}"}
    )
    assert codes.status_code == 200


def test_signing_in_again_reuses_the_demo_user(demo_client, session):
    first = demo_login(demo_client).json()["user"]["id"]
    second = demo_login(demo_client).json()["user"]["id"]
    assert first == second
    count = session.scalar(
        select(func.count()).select_from(UserIdentity).where(UserIdentity.provider == AuthProvider.DEMO)
    )
    assert count == 1


def test_unknown_persona_is_rejected(demo_client):
    assert demo_login(demo_client, "system_admin").status_code == 422
    assert demo_client.post("/auth/demo/login", json={}).status_code == 422


def test_demo_login_from_a_foreign_origin_is_refused(demo_client):
    response = demo_client.post(
        "/auth/demo/login", json={"persona": "student"}, headers={"Origin": "https://evil.example"}
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "origin_not_allowed"


def test_demo_login_sets_the_same_refresh_cookie(demo_client):
    response = demo_login(demo_client)
    cookie = response.headers["set-cookie"]
    assert "studyspot_refresh=" in cookie
    assert "HttpOnly" in cookie and "Path=/auth" in cookie and "Secure" in cookie
    refreshed = demo_client.post("/auth/refresh")
    assert refreshed.status_code == 200
    assert demo_client.post("/auth/logout").status_code == 204
    assert demo_client.post("/auth/refresh").status_code == 401


def test_demo_institution_must_exist(make_client):
    response = demo_login(make_client(demo_login_enabled=True, demo_institution="nowhere"))
    assert response.status_code == 404
    assert response.json()["detail"] == "institution_not_found"


def test_providers_lists_what_is_switched_on(make_client):
    assert make_client().get("/auth/providers").json() == {"providers": [], "demo": False}
    on = make_client(
        demo_login_enabled=True, microsoft_client_id="id", microsoft_client_secret="secret"
    )
    assert on.get("/auth/providers").json() == {"providers": ["microsoft"], "demo": True}
