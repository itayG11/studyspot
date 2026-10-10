"""The system admin deletes an institution made for a try: only one still
hidden, with no working login rule, and never the demo campus or the
system admin's own. Everything in it goes with it."""

from datetime import timedelta

import pytest
from conftest import SUNDAY_10AM
from sqlalchemy import func, select

from app.models import (
    AdminInvite,
    AuthProvider,
    Building,
    Institution,
    InstitutionLoginRule,
    Place,
    PlaceKind,
    User,
    UserIdentity,
    UserRole,
)
from app.seed import seed_demo


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


@pytest.fixture
def trial(session, owner) -> Institution:
    institution = Institution(name="ניסיון", slug="trial", timezone="Asia/Jerusalem")
    session.add(institution)
    session.flush()
    admin = User(institution_id=institution.id, email="a@x.example", display_name="A", role=UserRole.INSTITUTION_ADMIN)
    session.add(admin)
    session.flush()
    session.add(UserIdentity(user_id=admin.id, provider=AuthProvider.MICROSOFT, subject="t:a"))
    building = Building(institution_id=institution.id, code="T", name="בניין", floors_count=1)
    session.add(building)
    session.flush()
    session.add(Place(institution_id=institution.id, building_id=building.id, kind=PlaceKind.OPEN_AREA,
                      name="T1", floor=0, capacity=5))
    session.add(InstitutionLoginRule(institution_id=institution.id, provider=AuthProvider.EMAIL,
                                     value="trial.example", approved=False))
    session.add(AdminInvite(institution_id=institution.id, token_hash="h" * 64, created_by=owner.id,
                            created_at=SUNDAY_10AM, expires_at=SUNDAY_10AM + timedelta(days=7)))
    session.flush()
    return institution


def count(session, model, institution_id) -> int:
    return session.scalar(select(func.count()).select_from(model).where(model.institution_id == institution_id))


def test_a_trial_institution_goes_with_everything_in_it(staff, session, trial):
    tid = trial.id
    assert staff.delete("/system/institutions/trial").status_code == 204
    session.expire_all()
    assert session.get(Institution, tid) is None
    for model in (User, Building, Place, InstitutionLoginRule, AdminInvite):
        assert count(session, model, tid) == 0
    # Its admin's sign-in goes too: the next sign-in starts afresh.
    assert session.scalar(select(func.count()).select_from(UserIdentity).where(UserIdentity.subject == "t:a")) == 0


def test_only_the_system_admin_deletes(client, session, trial):
    admin = session.scalars(select(User).where(User.institution_id == trial.id)).one()
    client.user = admin
    assert client.delete("/system/institutions/trial").status_code == 403


def test_an_unknown_institution_is_404(staff):
    assert staff.delete("/system/institutions/nowhere").status_code == 404


def refused(staff, slug: str) -> str:
    response = staff.delete(f"/system/institutions/{slug}")
    assert response.status_code == 409
    return response.json()["detail"]


def test_an_open_institution_is_hidden_first(staff, session, trial):
    trial.is_active = True
    session.flush()
    assert refused(staff, "trial") == "institution_active"


def test_an_institution_with_a_working_rule_is_kept(staff, session, trial):
    trial.login_rules[0].approved = True
    session.flush()
    assert refused(staff, "trial") == "institution_has_rules"


def test_braude_is_kept(staff, session, braude):
    braude.is_active = False
    session.flush()
    assert refused(staff, "braude") == "institution_has_rules"


def test_the_demo_campus_is_kept(staff, session):
    demo = seed_demo(session)
    demo.is_active = False
    session.flush()
    assert refused(staff, "demo") == "institution_demo"


def test_the_system_admins_own_institution_is_kept(staff, session, owner, trial):
    owner.institution_id = trial.id
    session.flush()
    assert refused(staff, "trial") == "institution_has_system_admin"
