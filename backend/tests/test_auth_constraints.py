"""Database rules for sign-in: identities, institution login rules, sessions."""

from datetime import UTC, datetime, timedelta

from factories import assert_rejected, make_institution, make_user
from sqlalchemy.orm import Session

from app.models import AuthProvider, AuthSession, InstitutionLoginRule, UserIdentity, UserRole

NOW = datetime(2026, 10, 11, 7, 0, tzinfo=UTC)


def test_new_users_are_students(session: Session):
    user = make_user(session, make_institution(session))
    assert user.role == UserRole.STUDENT
    assert user.created_at is not None


def test_an_identity_belongs_to_one_user(session: Session):
    institution = make_institution(session)
    first, second = make_user(session, institution), make_user(session, institution)
    session.add(UserIdentity(user_id=first.id, provider=AuthProvider.MICROSOFT, subject="tid:oid"))
    session.flush()
    assert_rejected(
        session,
        lambda: session.add(
            UserIdentity(user_id=second.id, provider=AuthProvider.MICROSOFT, subject="tid:oid")
        ),
        "uq_user_identities_provider_subject",
    )
    # The same subject string from another provider is a different identity.
    session.add(UserIdentity(user_id=second.id, provider=AuthProvider.GOOGLE, subject="tid:oid"))
    session.flush()


def test_a_login_rule_belongs_to_one_institution(session: Session):
    first, second = make_institution(session, "first"), make_institution(session, "second")
    session.add(InstitutionLoginRule(institution_id=first.id, provider=AuthProvider.MICROSOFT, value="tenant-a"))
    session.flush()
    assert_rejected(
        session,
        lambda: session.add(
            InstitutionLoginRule(institution_id=second.id, provider=AuthProvider.MICROSOFT, value="tenant-a")
        ),
        "uq_institution_login_rules_approved_value",
    )


def test_rules_still_waiting_for_approval_may_share_a_value(session: Session):
    # Waiting holds nothing: the system admin approves one, the others go.
    first, second = make_institution(session, "first"), make_institution(session, "second")
    for institution in (first, second):
        session.add(InstitutionLoginRule(
            institution_id=institution.id, provider=AuthProvider.MICROSOFT, value="tenant-a", approved=False
        ))
    session.flush()


def test_login_rule_values_are_lowercase(session: Session):
    institution = make_institution(session)
    assert_rejected(
        session,
        lambda: session.add(
            InstitutionLoginRule(institution_id=institution.id, provider=AuthProvider.GOOGLE, value="Braude.ac.il")
        ),
        "ck_institution_login_rules_value_lowercase",
    )


def test_session_token_hash_is_unique_and_expires_after_creation(session: Session):
    user = make_user(session, make_institution(session))
    session.add(AuthSession(user_id=user.id, token_hash="a" * 64, created_at=NOW, expires_at=NOW + timedelta(days=7)))
    session.flush()
    assert_rejected(
        session,
        lambda: session.add(
            AuthSession(user_id=user.id, token_hash="a" * 64, created_at=NOW, expires_at=NOW + timedelta(days=7))
        ),
        "uq_sessions_token_hash",
    )
    assert_rejected(
        session,
        lambda: session.add(AuthSession(user_id=user.id, token_hash="b" * 64, created_at=NOW, expires_at=NOW)),
        "ck_sessions_expires_after_creation",
    )


def test_demo_identities_are_allowed_but_not_demo_login_rules(session: Session):
    institution = make_institution(session)
    user = make_user(session, institution)
    session.add(UserIdentity(user_id=user.id, provider=AuthProvider.DEMO, subject="student"))
    session.flush()
    assert_rejected(
        session,
        lambda: session.add(
            InstitutionLoginRule(institution_id=institution.id, provider=AuthProvider.DEMO, value="any")
        ),
        "ck_institution_login_rules_real_provider",
    )
