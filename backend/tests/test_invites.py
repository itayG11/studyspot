"""Accepting an admin invite: the link a new institution's admin receives.

Whoever opens it signed in becomes the admin of that institution. The
shared demo accounts, the users of a real institution (Braude) and the
system admin cannot: each would be a way to take over a campus.
"""

import threading
from datetime import timedelta

import pytest
from conftest import SUNDAY_10AM
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app import institutions
from app.accounts import sign_in
from app.config import get_settings
from app.errors import Refusal
from app.models import (
    AdminInvite,
    AuthProvider,
    Booking,
    BookingSource,
    BookingStatus,
    Institution,
    PlaceKind,
    User,
    UserIdentity,
    UserRole,
)
from app.oidc import ProviderIdentity
from app.seed import seed_demo


@pytest.fixture
def demo(session) -> Institution:
    return seed_demo(session)


@pytest.fixture
def tel_hai(session) -> Institution:
    institution = Institution(name="מכללת תל חי", slug="tel-hai", timezone="Asia/Jerusalem")
    session.add(institution)
    session.flush()
    return institution


def invite_for(session, institution, now=SUNDAY_10AM) -> str:
    return institutions.create_invite(session, institution, created_by=None, now=now, key=key())[1]


def key() -> bytes:
    return institutions.invite_key(get_settings().jwt_secret_bytes())


def visitor(session, demo, provider=AuthProvider.GOOGLE, subject="g-visitor") -> User:
    """Someone who signed in with a personal account: the open campus."""
    user = User(institution_id=demo.id, email="new.admin@gmail.com", display_name="New admin")
    session.add(user)
    session.flush()
    session.add(UserIdentity(user_id=user.id, provider=provider, subject=subject))
    session.flush()
    return user


def accept(client, token):
    return client.post("/invites/accept", json={"token": token})


def test_the_invited_user_becomes_the_institution_admin(client, session, demo, tel_hai):
    token = invite_for(session, tel_hai)
    client.user = visitor(session, demo)
    response = accept(client, token)
    assert response.status_code == 200
    assert response.json() == {"slug": "tel-hai", "name": "מכללת תל חי"}
    session.refresh(client.user)
    assert (client.user.institution_id, client.user.role) == (tel_hai.id, UserRole.INSTITUTION_ADMIN)
    invite = session.scalars(select(AdminInvite)).one()
    assert invite.used_by == client.user.id and invite.used_at is not None


def test_inspect_names_the_institution_without_using_the_invite(client, session, demo, tel_hai):
    token = invite_for(session, tel_hai)
    client.user = visitor(session, demo)
    assert client.post("/invites/inspect", json={"token": token}).json()["name"] == "מכללת תל חי"
    assert session.scalars(select(AdminInvite)).one().used_at is None


def test_an_invite_works_once(client, session, demo, tel_hai):
    token = invite_for(session, tel_hai)
    client.user = visitor(session, demo)
    assert accept(client, token).status_code == 200
    client.user = visitor(session, demo, subject="g-someone-else")
    response = accept(client, token)
    assert (response.status_code, response.json()["detail"]) == (410, "invite_used")


def test_an_expired_invite_is_refused(client, session, demo, tel_hai):
    token = invite_for(session, tel_hai, now=SUNDAY_10AM - timedelta(days=8))
    client.user = visitor(session, demo)
    assert accept(client, token).json()["detail"] == "invite_expired"


def test_a_revoked_invite_is_refused(client, session, demo, tel_hai):
    token = invite_for(session, tel_hai)
    session.scalars(select(AdminInvite)).one().revoked_at = SUNDAY_10AM
    session.flush()
    client.user = visitor(session, demo)
    assert accept(client, token).json()["detail"] == "invite_revoked"


def test_a_wrong_token_is_404(client, session, demo, tel_hai):
    invite_for(session, tel_hai)
    client.user = visitor(session, demo)
    assert accept(client, "x" * 43).status_code == 404


def test_the_shared_demo_account_cannot_take_an_invite(client, session, demo, tel_hai):
    # Every visitor of the live site signs in as the same demo student.
    token = invite_for(session, tel_hai)
    client.user = visitor(session, demo, provider=AuthProvider.DEMO, subject="demo:student")
    assert accept(client, token).json()["detail"] == "invite_demo_account"
    assert session.scalars(select(AdminInvite)).one().used_at is None


def test_a_student_of_a_real_institution_cannot_move(client, session, braude, tel_hai):
    token = invite_for(session, tel_hai)  # client.user is a Braude student
    assert accept(client, token).json()["detail"] == "invite_other_institution"


def test_the_system_admin_is_refused(client, session, demo, tel_hai):
    token = invite_for(session, tel_hai)
    client.user = visitor(session, demo)
    client.user.role = UserRole.SYSTEM_ADMIN
    session.flush()
    assert accept(client, token).json()["detail"] == "invite_system_admin"


def test_moving_drops_the_bookings_of_the_open_campus(client, session, demo, tel_hai):
    # They point at the demo campus's places, which the new campus has not.
    client.user = visitor(session, demo)
    room = next(p for b in demo.buildings for p in b.places if p.kind == PlaceKind.GROUP_ROOM)
    starts = SUNDAY_10AM + timedelta(hours=2)
    session.add(Booking(
        institution_id=demo.id, user_id=client.user.id, place_id=room.id, starts_at=starts,
        ends_at=starts + timedelta(hours=1), status=BookingStatus.BOOKED, source=BookingSource.ADVANCE,
    ))
    session.flush()
    assert accept(client, invite_for(session, tel_hai)).status_code == 200
    assert session.scalar(select(func.count()).select_from(Booking)) == 0


def test_the_new_admin_signs_in_again_and_stays_in_their_institution(client, session, demo, tel_hai):
    client.user = visitor(session, demo, subject="g-visitor")
    accept(client, invite_for(session, tel_hai))
    identity = ProviderIdentity(subject="g-visitor", institution_key=None, email="new.admin@gmail.com", display_name="N")
    again = sign_in(session, AuthProvider.GOOGLE, identity, SUNDAY_10AM, "demo")
    assert (again.institution_id, again.role) == (tel_hai.id, UserRole.INSTITUTION_ADMIN)


def test_a_rule_of_another_institution_still_wins_over_an_admin(session, braude, demo, tel_hai):
    # An admin of Tel Hai who signs in with a Braude account is refused,
    # as before: the rule says that account belongs to Braude.
    user = visitor(session, demo, provider=AuthProvider.MICROSOFT, subject="tid:oid")
    user.institution_id, user.role = tel_hai.id, UserRole.INSTITUTION_ADMIN
    session.flush()
    braude_tenant = next(r.value for r in braude.login_rules if r.provider == AuthProvider.MICROSOFT)
    identity = ProviderIdentity(subject="tid:oid", institution_key=braude_tenant, email="x@braude.ac.il", display_name="X")
    with pytest.raises(Refusal) as refused:
        sign_in(session, AuthProvider.MICROSOFT, identity, SUNDAY_10AM, "demo")
    assert refused.value.code == "institution_not_supported"


def test_two_tabs_accepting_one_invite_at_once_give_one_admin(engine):
    # Like tests/test_concurrency.py: a race exists only between real
    # transactions, so this one commits, and cleans up after itself.
    with Session(engine) as db:
        open_campus = Institution(name="Open race", slug="open-race")
        target = Institution(name="Invite race", slug="invite-race")
        db.add_all([open_campus, target])
        db.flush()
        users = [User(institution_id=open_campus.id, email=f"r{i}@gmail.com", display_name=f"R{i}") for i in range(2)]
        db.add_all(users)
        db.flush()
        _, token = institutions.create_invite(db, target, created_by=None, now=SUNDAY_10AM, key=key())
        db.commit()
        ids, user_ids = [open_campus.id, target.id], [u.id for u in users]
    start_together = threading.Barrier(2)
    results: list[str] = []
    lock = threading.Lock()

    def take(user_id: int) -> None:
        with Session(engine) as db:
            user = db.get(User, user_id)
            start_together.wait()
            try:
                institutions.accept_invite(db, user, token, SUNDAY_10AM, key())
                db.commit()
                outcome = "ok"
            except Refusal as refusal:
                db.rollback()
                outcome = refusal.code
        with lock:
            results.append(outcome)

    threads = [threading.Thread(target=take, args=(uid,)) for uid in user_ids]
    try:
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)
        assert sorted(results) == ["invite_used", "ok"]
    finally:
        with Session(engine) as db:
            db.execute(delete(Institution).where(Institution.id.in_(ids)))
            db.commit()


def test_an_admin_made_without_an_invite_gets_no_exception(session, braude, demo):
    # A Braude admin set by hand whose sign-in no longer matches Braude's
    # rule is refused, as before: only an invite makes the exception.
    user = visitor(session, demo, subject="g-hand")
    user.institution_id, user.role = braude.id, UserRole.INSTITUTION_ADMIN
    session.flush()
    identity = ProviderIdentity(subject="g-hand", institution_key=None, email="new.admin@gmail.com", display_name="N")
    with pytest.raises(Refusal) as refused:
        sign_in(session, AuthProvider.GOOGLE, identity, SUNDAY_10AM, "demo")
    assert refused.value.code == "institution_not_supported"


def test_the_invited_admin_signs_in_even_where_there_is_no_open_campus(client, session, demo, tel_hai):
    client.user = visitor(session, demo, subject="g-visitor")
    accept(client, invite_for(session, tel_hai))
    identity = ProviderIdentity(subject="g-visitor", institution_key=None, email="new.admin@gmail.com", display_name="N")
    again = sign_in(session, AuthProvider.GOOGLE, identity, SUNDAY_10AM, open_slug=None)
    assert again.institution_id == tel_hai.id


def test_an_admin_of_one_institution_cannot_leave_it_by_another_invite(client, session, demo, tel_hai):
    # Their institution would be left with no admin, and nobody would know.
    client.user = visitor(session, demo)
    accept(client, invite_for(session, tel_hai))
    other = Institution(name="אחר", slug="other-one", timezone="Asia/Jerusalem")
    session.add(other)
    session.flush()
    assert accept(client, invite_for(session, other)).json()["detail"] == "invite_already_admin"


def test_the_owner_who_tried_an_invite_and_then_joined_the_list_still_signs_in(client, session, demo, tel_hai):
    client.user = visitor(session, demo, subject="g-visitor")
    accept(client, invite_for(session, tel_hai))
    me = ProviderIdentity(
        subject="g-visitor", institution_key=None, email="new.admin@gmail.com", display_name="N", email_verified=True
    )
    listed = frozenset({"new.admin@gmail.com"})
    for _ in range(2):  # the second sign-in is the one that used to fail
        user = sign_in(session, AuthProvider.GOOGLE, me, SUNDAY_10AM, "demo", system_admins=listed)
    assert user.role == UserRole.SYSTEM_ADMIN
    # Off the list again: back to the admin of the institution they were invited to.
    user = sign_in(session, AuthProvider.GOOGLE, me, SUNDAY_10AM, "demo", system_admins=frozenset())
    assert (user.role, user.institution_id) == (UserRole.INSTITUTION_ADMIN, tel_hai.id)
