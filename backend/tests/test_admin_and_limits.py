"""Roles, the first admin endpoints, the admin CLI, and rate limiting."""

import pytest
from sqlalchemy import select

from app.models import User, UserRole
from conftest import code_for, place_named


@pytest.fixture
def admin(session, braude) -> User:
    user = User(
        institution_id=braude.id, email="dalitc@braude.ac.il", display_name="Admin",
        role=UserRole.INSTITUTION_ADMIN,
    )
    session.add(user)
    session.flush()
    return user


@pytest.fixture
def other_institution_admin(session) -> User:
    from app.seed import seed_institution

    other = seed_institution(
        session,
        {"institution": {"name": "Other", "slug": "other", "timezone": "Asia/Jerusalem"},
         "buildings": []},
    )
    user = User(
        institution_id=other.id, email="admin@other.example", display_name="Other admin",
        role=UserRole.INSTITUTION_ADMIN,
    )
    session.add(user)
    session.flush()
    return user


# --- Roles -------------------------------------------------------------------------


def test_students_cannot_use_admin_endpoints(client, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    assert client.get("/admin/institutions/braude/codes").status_code == 403
    assert client.post(f"/admin/places/{area.id}/revoke-code").status_code == 403


def test_anonymous_visitors_cannot_use_admin_endpoints(client):
    client.user = None
    assert client.get("/admin/institutions/braude/codes").status_code == 401


def test_institution_admin_lists_codes_of_their_campus(client, admin):
    client.user = admin
    codes = client.get("/admin/institutions/braude/codes").json()
    assert len(codes) == 10
    assert all(c["code"].startswith(f"p{c['place_id']}.v1.") for c in codes)


def test_admin_of_another_institution_sees_nothing(client, braude, other_institution_admin):
    client.user = other_institution_admin
    area = place_named(braude, "L", "מתחם לימוד")
    assert client.get("/admin/institutions/braude/codes").status_code == 404
    assert client.post(f"/admin/places/{area.id}/revoke-code").status_code == 404


def test_revoking_a_code_makes_the_printed_one_useless(client, braude, admin, student):
    area = place_named(braude, "L", "מתחם לימוד")
    printed = code_for(area)
    client.user = admin
    response = client.post(f"/admin/places/{area.id}/revoke-code")
    assert response.status_code == 200
    new_code = response.json()["code"]
    assert new_code.startswith(f"p{area.id}.v2.")

    client.user = student
    old = client.post("/check-ins", json={"code": printed})
    assert (old.status_code, old.json()["detail"]) == (400, "invalid_code")


def test_system_admin_manages_every_institution(client, session, other_institution_admin):
    other_institution_admin.role = UserRole.SYSTEM_ADMIN
    session.flush()
    client.user = other_institution_admin
    assert client.get("/admin/institutions/braude/codes").status_code == 200


# --- Admin command line ------------------------------------------------------------


def test_grant_role_cli(session, braude, student, monkeypatch, capsys):
    import app.admin as cli

    class Bound:
        def __init__(self, bind=None):
            pass

        def __enter__(self):
            return session

        def __exit__(self, *exc):
            return False

    monkeypatch.setattr(cli, "SessionLocal", Bound)
    monkeypatch.setattr(cli, "get_engine", lambda: None)
    assert cli.main(["grant-role", "--email", "STUDENT@braude.example", "institution_admin"]) == 0
    assert session.scalars(select(User).where(User.id == student.id)).one().role == "institution_admin"
    assert cli.main(["grant-role", "--email", "nobody@x.example", "student"]) == 1


# --- Rate limiting -------------------------------------------------------------------


def test_too_many_writes_get_429(client, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    body = {"code": code_for(area)}
    statuses = [client.post("/check-ins", json=body).status_code for _ in range(31)]
    assert statuses[:30].count(429) == 0
    assert statuses[30] == 429


def test_limits_are_per_user(client, braude, admin):
    area = place_named(braude, "L", "מתחם לימוד")
    body = {"code": code_for(area)}
    for _ in range(30):
        client.post("/check-ins", json=body)
    client.user = admin
    assert client.post("/check-ins", json=body).status_code != 429


def test_too_many_sign_in_attempts_get_429(client):
    statuses = [client.get("/auth/microsoft/login", follow_redirects=False).status_code for _ in range(21)]
    assert statuses[20] == 429
