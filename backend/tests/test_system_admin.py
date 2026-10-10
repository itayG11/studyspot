"""The system admin: whoever runs the whole service.

Set by SYSTEM_ADMIN_EMAILS, and honoured only for a Google sign-in whose
address Google itself has verified. Microsoft and the e-mail code do not
promise the same, so they never make anyone a system admin.
"""

from conftest import SUNDAY_10AM

from app.accounts import sign_in
from app.config import Settings
from app.models import AuthProvider, UserRole
from app.oidc import ProviderIdentity
from app.seed import seed_demo

ME = "owner@gmail.com"


def google(email: str = ME, verified: bool = True, subject: str = "g-1") -> ProviderIdentity:
    return ProviderIdentity(
        subject=subject, institution_key=None, email=email, display_name="Owner", email_verified=verified
    )


def enter(session, identity, provider=AuthProvider.GOOGLE, admins=frozenset({ME})):
    seed_demo(session)
    return sign_in(session, provider, identity, SUNDAY_10AM, "demo", system_admins=admins)


def test_a_listed_and_verified_google_address_becomes_system_admin(session):
    assert enter(session, google()).role == UserRole.SYSTEM_ADMIN


def test_an_address_google_has_not_verified_does_not(session):
    assert enter(session, google(verified=False)).role == UserRole.STUDENT


def test_microsoft_with_the_same_address_does_not(session):
    identity = ProviderIdentity(subject="tid:oid", institution_key=None, email=ME, display_name="Owner")
    assert enter(session, identity, provider=AuthProvider.MICROSOFT).role == UserRole.STUDENT


def test_an_address_not_on_the_list_does_not(session):
    assert enter(session, google(email="someone@gmail.com")).role == UserRole.STUDENT


def test_taken_off_the_list_means_a_student_again_at_the_next_sign_in(session):
    assert enter(session, google()).role == UserRole.SYSTEM_ADMIN
    again = sign_in(session, AuthProvider.GOOGLE, google(), SUNDAY_10AM, "demo", system_admins=frozenset())
    assert again.role == UserRole.STUDENT


def test_the_list_setting_is_read_lowercase_and_blank_means_nobody():
    def make(value: str) -> Settings:
        return Settings(
            database_url="postgresql+psycopg://unused@localhost/unused",
            jwt_secret="test-jwt-secret-that-is-long-enough-0123456789",
            _env_file=None,
            system_admin_emails=value,
        )

    assert make(" Owner@Gmail.com , second@gmail.com ").system_admins() == {"owner@gmail.com", "second@gmail.com"}
    assert make("").system_admins() == frozenset()


def test_a_listed_address_outside_gmail_needs_its_own_workspace(session):
    # Google's email_verified is reliable only for gmail.com, or when the
    # account is the domain's own Workspace (hd). Anyone can make a personal
    # Google account with another address, verified long ago or recycled.
    college = "owner@college.example"
    personal = ProviderIdentity(subject="g-2", institution_key=None, email=college, display_name="O", email_verified=True)
    assert enter(session, personal, admins=frozenset({college})).role == UserRole.STUDENT
    workspace = ProviderIdentity(
        subject="g-3", institution_key="college.example", email=college, display_name="O", email_verified=True
    )
    user = sign_in(session, AuthProvider.GOOGLE, workspace, SUNDAY_10AM, "demo", system_admins=frozenset({college}))
    assert user.role == UserRole.SYSTEM_ADMIN


def test_taken_off_the_list_loses_the_role_at_once_not_only_at_the_next_sign_in(client, session):
    owner = enter(session, google())
    client.user = None
    from app.auth import demote_unlisted

    assert demote_unlisted(session, owner, frozenset({ME})).role == UserRole.SYSTEM_ADMIN
    assert demote_unlisted(session, owner, frozenset()).role == UserRole.STUDENT
