"""The system admin creates institutions and invites their first admin."""

import re
from pathlib import Path

import pytest
from sqlalchemy import select

from app.institutions import RESERVED_SLUGS
from app.models import AdminInvite, Institution, User, UserRole

FRONTEND_ROUTER = Path(__file__).resolve().parents[2] / "frontend" / "src" / "router.tsx"


@pytest.fixture
def owner(session, braude) -> User:
    user = User(institution_id=braude.id, email="owner@gmail.com", display_name="Owner", role=UserRole.SYSTEM_ADMIN)
    session.add(user)
    session.flush()
    return user


@pytest.fixture
def staff(client, owner):
    client.user = owner
    return client


NEW = {"name": "מכללת תל חי", "slug": "tel-hai", "timezone": "Asia/Jerusalem"}


def test_a_new_institution_starts_hidden(staff, session):
    response = staff.post("/system/institutions", json=NEW)
    assert response.status_code == 201
    created = session.scalars(select(Institution).where(Institution.slug == "tel-hai")).one()
    assert (created.name, created.is_active) == ("מכללת תל חי", False)
    assert staff.get("/institutions").json() == []  # not in the public list


def test_only_the_system_admin_creates_institutions(client, session, braude):
    admin = User(institution_id=braude.id, email="a@braude.ac.il", display_name="A", role=UserRole.INSTITUTION_ADMIN)
    session.add(admin)
    session.flush()
    for user in (client.user, admin):  # a student, and an institution admin
        client.user = user
        assert client.post("/system/institutions", json=NEW).status_code == 403
        assert client.get("/system/institutions").status_code == 403


@pytest.mark.parametrize("slug", ["scan", "admin", "login", "api", "invite", "system"])
def test_a_name_the_site_already_uses_is_refused(staff, slug):
    response = staff.post("/system/institutions", json={**NEW, "slug": slug})
    assert (response.status_code, response.json()["detail"]) == (422, "institution_slug_reserved")


def test_every_fixed_address_of_the_site_is_reserved():
    # A fixed address wins over an institution's name (router.tsx), so an
    # institution called like one would never open. Keep the two in step.
    paths = set(re.findall(r"path: '([a-z-]+)", FRONTEND_ROUTER.read_text()))
    assert paths <= RESERVED_SLUGS, paths - RESERVED_SLUGS


@pytest.mark.parametrize("bad", [{"slug": "Tel Hai"}, {"slug": "-x"}, {"timezone": "Mars/Olympus"}, {"name": " "}])
def test_bad_details_are_refused(staff, bad):
    assert staff.post("/system/institutions", json={**NEW, **bad}).status_code == 422


def test_a_taken_short_name_is_refused(staff):
    assert staff.post("/system/institutions", json={**NEW, "slug": "braude"}).status_code == 409


def test_the_system_admin_sees_hidden_institutions_too(staff):
    staff.post("/system/institutions", json=NEW)
    listed = {i["slug"]: i for i in staff.get("/system/institutions").json()}
    assert listed["tel-hai"]["is_active"] is False
    assert listed["braude"]["buildings"] == 7


def test_an_invite_link_is_shown_once_and_kept_only_as_an_hmac(staff, session):
    staff.post("/system/institutions", json=NEW)
    response = staff.post("/system/institutions/tel-hai/invites")
    assert response.status_code == 201
    token = response.json()["token"]
    assert len(token) >= 40
    invite = session.scalars(select(AdminInvite)).one()
    assert token not in invite.token_hash and len(invite.token_hash) == 64
    listed = staff.get("/system/institutions/tel-hai/invites").json()
    assert listed[0]["status"] == "open" and "token" not in listed[0]


def test_an_open_invite_can_be_revoked(staff):
    staff.post("/system/institutions", json=NEW)
    staff.post("/system/institutions/tel-hai/invites")
    invite_id = staff.get("/system/institutions/tel-hai/invites").json()[0]["id"]
    assert staff.post(f"/system/invites/{invite_id}/revoke").status_code == 200
    assert staff.get("/system/institutions/tel-hai/invites").json()[0]["status"] == "revoked"
    assert staff.post(f"/system/invites/{invite_id}/revoke").status_code == 409  # not open any more


def test_an_invite_to_an_unknown_institution_is_404(staff):
    assert staff.post("/system/institutions/nowhere/invites").status_code == 404
