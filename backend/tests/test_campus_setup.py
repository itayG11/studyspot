"""The setup tab: an institution's admin sets up its details, who signs in,
and opens it to the public list. Each attempt to reach further is refused."""

from datetime import timedelta

import pytest
from conftest import SUNDAY_10AM
from sqlalchemy import func, select

from app.accounts import sign_in
from app.config import Settings, get_settings
from app.errors import Refusal
from app.main import app
from app.models import (
    AuthProvider,
    Booking,
    BookingSource,
    BookingStatus,
    Institution,
    InstitutionLoginRule,
    PlaceKind,
    User,
    UserIdentity,
    UserRole,
)
from app.oidc import ProviderIdentity
from app.seed import seed_demo

TENANT = "11111111-2222-3333-4444-555555555555"
CONSUMERS = "9188040d-6c67-4c5b-b112-36a304b66dad"


@pytest.fixture
def tel_hai(session) -> Institution:
    institution = Institution(name="מכללת תל חי", slug="tel-hai", timezone="Asia/Jerusalem")
    session.add(institution)
    session.flush()
    return institution


@pytest.fixture
def manager(client, session, tel_hai):
    admin = User(institution_id=tel_hai.id, email="a@gmail.com", display_name="A", role=UserRole.INSTITUTION_ADMIN)
    session.add(admin)
    session.flush()
    client.user = admin
    return client


def make_settings(**overrides) -> Settings:
    base = get_settings()
    return Settings(
        database_url=base.database_url,
        jwt_secret=base.jwt_secret.get_secret_value(),
        _env_file=None,
        **overrides,
    )


@pytest.fixture
def settings_with_microsoft():
    app.dependency_overrides[get_settings] = lambda: make_settings(microsoft_client_id="client-id-for-consent")
    yield
    app.dependency_overrides.pop(get_settings, None)


def rule(provider: str, value: str) -> dict:
    return {"provider": provider, "value": value}


def test_the_setup_says_what_is_done_and_what_is_left(manager, settings_with_microsoft):
    body = manager.get("/admin/institutions/tel-hai/setup").json()
    assert body["name"] == "מכללת תל חי" and body["is_active"] is False
    assert (body["rules"], body["buildings"], body["located_buildings"], body["places"]) == ([], 0, 0, 0)
    assert body["microsoft_client_id"] == "client-id-for-consent"  # public: it goes in the consent link


def test_the_admin_renames_and_activates_the_institution(manager, session, tel_hai):
    response = manager.patch("/admin/institutions/tel-hai", json={"name": "תל חי", "is_active": True})
    assert response.status_code == 200
    session.refresh(tel_hai)
    assert (tel_hai.name, tel_hai.is_active) == ("תל חי", True)
    assert manager.get("/institutions").json() == [{"slug": "tel-hai", "name": "תל חי"}]


def test_an_unknown_time_zone_is_refused(manager):
    assert manager.patch("/admin/institutions/tel-hai", json={"timezone": "Mars/Olympus"}).status_code == 422


def test_the_admin_of_another_institution_gets_404(client, session, braude, tel_hai):
    other = User(institution_id=braude.id, email="b@braude.ac.il", display_name="B", role=UserRole.INSTITUTION_ADMIN)
    session.add(other)
    session.flush()
    client.user = other
    assert client.get("/admin/institutions/tel-hai/setup").status_code == 404
    assert client.patch("/admin/institutions/tel-hai", json={"is_active": True}).status_code == 404
    assert client.post("/admin/institutions/tel-hai/login-rules", json=rule("email", "telhai.ac.il")).status_code == 404


def test_a_student_gets_403(client, tel_hai):
    assert client.get("/admin/institutions/tel-hai/setup").status_code == 403


def test_email_domains_and_a_microsoft_tenant_can_be_added_and_removed(manager, session):
    assert manager.post("/admin/institutions/tel-hai/login-rules", json=rule("email", "Telhai.AC.il")).status_code == 201
    created = manager.post("/admin/institutions/tel-hai/login-rules", json=rule("microsoft", TENANT))
    assert created.status_code == 201
    values = {r["value"] for r in manager.get("/admin/institutions/tel-hai/setup").json()["rules"]}
    assert values == {"telhai.ac.il", TENANT}
    assert manager.delete(f"/admin/login-rules/{created.json()['id']}").status_code == 204
    left = manager.get("/admin/institutions/tel-hai/setup").json()["rules"]
    assert [r["value"] for r in left] == ["telhai.ac.il"]


@pytest.mark.parametrize(
    ("provider", "value", "code"),
    [
        ("email", "e.braude.ac.il", "login_rule_taken"),  # Braude's students
        ("email", "gmail.com", "login_rule_public_domain"),
        ("email", "outlook.com", "login_rule_public_domain"),
        ("microsoft", CONSUMERS, "login_rule_public_domain"),  # every personal Microsoft account
    ],
)
def test_a_rule_that_would_take_other_peoples_accounts_is_refused(manager, braude, provider, value, code):
    response = manager.post("/admin/institutions/tel-hai/login-rules", json=rule(provider, value))
    assert (response.status_code, response.json()["detail"]) == (409, code)


@pytest.mark.parametrize(
    "bad", [rule("email", "not a domain"), rule("email", "@telhai.ac.il"), rule("microsoft", "abc"), rule("google", "x.com"), rule("demo", "x")]
)
def test_a_malformed_rule_is_refused(manager, bad):
    assert manager.post("/admin/institutions/tel-hai/login-rules", json=bad).status_code == 422


def test_a_rule_of_another_institution_cannot_be_removed(manager, braude):
    braude_rule = braude.login_rules[0]
    assert manager.delete(f"/admin/login-rules/{braude_rule.id}").status_code == 404


@pytest.fixture
def demo_locked(session):
    seed_demo(session)
    app.dependency_overrides[get_settings] = lambda: make_settings(demo_login_enabled=True)
    yield
    app.dependency_overrides.pop(get_settings, None)


def test_the_shared_demo_campus_can_be_looked_at_but_not_changed(client, session, demo_locked):
    demo = session.scalars(select(Institution).where(Institution.slug == "demo")).one()
    admin = User(institution_id=demo.id, email="d@x.invalid", display_name="D", role=UserRole.INSTITUTION_ADMIN)
    session.add(admin)
    session.flush()
    client.user = admin
    assert client.get("/admin/institutions/demo/setup").json()["locked"] is True
    for response in (
        client.patch("/admin/institutions/demo", json={"is_active": False}),
        client.post("/admin/institutions/demo/login-rules", json=rule("email", "x.ac.il")),
    ):
        assert (response.status_code, response.json()["detail"]) == (403, "demo_campus_locked")


def test_a_student_of_the_open_campus_moves_when_a_new_rule_matches_them(session, tel_hai):
    # Someone of tenant X signed in before Tel Hai added X: they were put in
    # the open campus. Signing in now, they join Tel Hai instead of being
    # refused; their demo bookings go, as with an invite.
    demo = seed_demo(session)
    tel_hai.is_active = True
    user = User(institution_id=demo.id, email="s@telhai.ac.il", display_name="S")
    session.add(user)
    session.flush()
    session.add(UserIdentity(user_id=user.id, provider=AuthProvider.MICROSOFT, subject=f"{TENANT}:oid"))
    session.add(InstitutionLoginRule(institution_id=tel_hai.id, provider=AuthProvider.MICROSOFT, value=TENANT))
    room = next(p for b in demo.buildings for p in b.places if p.kind == PlaceKind.GROUP_ROOM)
    starts = SUNDAY_10AM + timedelta(hours=2)
    session.add(Booking(
        institution_id=demo.id, user_id=user.id, place_id=room.id, starts_at=starts,
        ends_at=starts + timedelta(hours=1), status=BookingStatus.BOOKED, source=BookingSource.ADVANCE,
    ))
    session.flush()
    identity = ProviderIdentity(subject=f"{TENANT}:oid", institution_key=TENANT, email="s@telhai.ac.il", display_name="S")
    again = sign_in(session, AuthProvider.MICROSOFT, identity, SUNDAY_10AM, "demo")
    session.flush()  # the move must satisfy the composite keys
    assert again.institution_id == tel_hai.id
    assert session.scalar(select(func.count()).select_from(Booking).where(Booking.user_id == user.id)) == 0


def test_no_one_moves_to_an_institution_still_being_set_up(session, tel_hai):
    demo = seed_demo(session)
    user = User(institution_id=demo.id, email="s@telhai.ac.il", display_name="S")
    session.add(user)
    session.flush()
    session.add(UserIdentity(user_id=user.id, provider=AuthProvider.MICROSOFT, subject=f"{TENANT}:o4"))
    session.add(InstitutionLoginRule(institution_id=tel_hai.id, provider=AuthProvider.MICROSOFT, value=TENANT))
    session.flush()
    identity = ProviderIdentity(subject=f"{TENANT}:o4", institution_key=TENANT, email="s@telhai.ac.il", display_name="S")
    with pytest.raises(Refusal):
        sign_in(session, AuthProvider.MICROSOFT, identity, SUNDAY_10AM, "demo")


def test_a_user_of_a_real_institution_never_moves_by_a_rule(session, braude, tel_hai):
    # Only the open campus is left this way: a Braude user stays refused.
    user = User(institution_id=braude.id, email="s@braude.ac.il", display_name="S")
    session.add(user)
    session.flush()
    session.add(UserIdentity(user_id=user.id, provider=AuthProvider.MICROSOFT, subject=f"{TENANT}:oid2"))
    session.add(InstitutionLoginRule(institution_id=tel_hai.id, provider=AuthProvider.MICROSOFT, value=TENANT))
    session.flush()
    identity = ProviderIdentity(subject=f"{TENANT}:oid2", institution_key=TENANT, email="s@braude.ac.il", display_name="S")
    with pytest.raises(Refusal):
        sign_in(session, AuthProvider.MICROSOFT, identity, SUNDAY_10AM, "demo")


# --- A new rule waits for the system admin (review fixes) ------------------------


def test_a_rule_added_by_the_institution_admin_waits_for_the_system_admin(manager, session, tel_hai):
    # Nothing proves the domain or tenant is theirs, so a person looks first.
    created = manager.post("/admin/institutions/tel-hai/login-rules", json=rule("microsoft", TENANT)).json()
    assert created["approved"] is False
    identity = ProviderIdentity(subject=f"{TENANT}:new", institution_key=TENANT, email="n@telhai.ac.il", display_name="N")
    with pytest.raises(Refusal):  # no open campus here: a pending rule lets nobody in
        sign_in(session, AuthProvider.MICROSOFT, identity, SUNDAY_10AM, None)


def test_a_pending_email_domain_gets_no_codes(manager, session):
    from app.email_codes import domain_is_supported

    manager.post("/admin/institutions/tel-hai/login-rules", json=rule("email", "telhai.ac.il"))
    assert domain_is_supported(session, "s@telhai.ac.il") is False


@pytest.fixture
def owner(session, braude) -> User:
    user = User(institution_id=braude.id, email="owner@gmail.com", display_name="O", role=UserRole.SYSTEM_ADMIN)
    session.add(user)
    session.flush()
    return user


def test_the_system_admin_sees_pending_rules_and_approves_one(manager, client, session, owner, tel_hai):
    created = manager.post("/admin/institutions/tel-hai/login-rules", json=rule("email", "telhai.ac.il")).json()
    client.user = owner
    pending = client.get("/system/login-rules").json()
    assert [(p["value"], p["institution_name"]) for p in pending] == [("telhai.ac.il", "מכללת תל חי")]
    assert client.post(f"/system/login-rules/{created['id']}/approve").status_code == 200
    assert client.get("/system/login-rules").json() == []
    from app.email_codes import domain_is_supported

    assert domain_is_supported(session, "s@telhai.ac.il") is True


def test_only_the_system_admin_approves(manager, session):
    created = manager.post("/admin/institutions/tel-hai/login-rules", json=rule("email", "telhai.ac.il")).json()
    assert manager.post(f"/system/login-rules/{created['id']}/approve").status_code == 403
    assert manager.get("/system/login-rules").status_code == 403


def test_a_rule_the_system_admin_adds_works_at_once(client, owner, tel_hai):
    client.user = owner
    created = client.post("/admin/institutions/tel-hai/login-rules", json=rule("email", "telhai.ac.il")).json()
    assert created["approved"] is True


def test_the_last_rule_cannot_be_removed_while_students_rely_on_it(manager, session, tel_hai):
    # Removing it would lock every student out, and free the value for
    # another institution to take them.
    session.add(InstitutionLoginRule(institution_id=tel_hai.id, provider=AuthProvider.EMAIL, value="telhai.ac.il"))
    session.add(User(institution_id=tel_hai.id, email="s@telhai.ac.il", display_name="S"))
    session.flush()
    only = tel_hai.login_rules[0]
    response = manager.delete(f"/admin/login-rules/{only.id}")
    assert (response.status_code, response.json()["detail"]) == (409, "login_rule_last")


def test_removing_a_rule_from_the_screen_is_allowed_when_another_remains(manager, session, tel_hai):
    for value in ("telhai.ac.il", "students.telhai.ac.il"):
        session.add(InstitutionLoginRule(institution_id=tel_hai.id, provider=AuthProvider.EMAIL, value=value))
    session.add(User(institution_id=tel_hai.id, email="s@telhai.ac.il", display_name="S"))
    session.flush()
    assert manager.delete(f"/admin/login-rules/{tel_hai.login_rules[0].id}").status_code == 204


def test_only_the_real_open_campus_gives_up_students_and_only_to_an_open_institution(session, tel_hai):
    # Another institution without rules (one being set up) is not the open campus.
    setting_up = Institution(name="בהקמה", slug="setting-up", timezone="Asia/Jerusalem")
    session.add(setting_up)
    session.flush()
    user = User(institution_id=setting_up.id, email="s@x.ac.il", display_name="S")
    session.add(user)
    session.flush()
    session.add(UserIdentity(user_id=user.id, provider=AuthProvider.MICROSOFT, subject=f"{TENANT}:o3"))
    session.add(InstitutionLoginRule(institution_id=tel_hai.id, provider=AuthProvider.MICROSOFT, value=TENANT))
    tel_hai.is_active = True
    seed_demo(session)
    session.flush()
    identity = ProviderIdentity(subject=f"{TENANT}:o3", institution_key=TENANT, email="s@x.ac.il", display_name="S")
    with pytest.raises(Refusal):
        sign_in(session, AuthProvider.MICROSOFT, identity, SUNDAY_10AM, "demo")
