"""An institution's own setup, done by its admin: its details, who signs in
(login rules), and opening it to the public list."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import Refusal
from app.models import AuthProvider, Building, Institution, InstitutionLoginRule, Place, User, UserRole

# Microsoft's one tenant for every personal account (outlook.com, hotmail).
# As a rule it would put every personal Microsoft account in one institution.
MICROSOFT_CONSUMERS = "9188040d-6c67-4c5b-b112-36a304b66dad"

# Domains anyone can open an address at. As a rule, any of their addresses
# would join the institution. (Until a domain is verified, e.g. by DNS, an
# institution could still name a domain it does not own: a known limit.)
PUBLIC_MAIL_DOMAINS = frozenset({
    "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
    "yahoo.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
    "walla.co.il", "walla.com", "012.net.il", "bezeqint.net", "netvision.net.il",
    "hotmail.co.il", "outlook.co.il", "yahoo.co.il", "hotmail.co.uk", "live.co.uk", "gmx.com",
    "gmx.net", "mail.ru", "yandex.ru", "yandex.com", "zoho.com", "tutanota.com", "pm.me", "mail.com",
})
# A list cannot be complete: the system admin's approval (approved, below) is
# the real check. The list only refuses the obvious ones at once.


def setup_counts(db: Session, institution: Institution) -> tuple[int, int, int]:
    """Buildings, buildings placed on the map, and places."""
    buildings, located = db.execute(
        select(func.count(), func.count(Building.latitude)).where(Building.institution_id == institution.id)
    ).one()
    places = db.scalar(select(func.count()).select_from(Place).where(Place.institution_id == institution.id))
    return buildings, located, places


def add_login_rule(
    db: Session, institution: Institution, provider: AuthProvider, value: str, approved: bool
) -> InstitutionLoginRule:
    if (provider, value) in ((AuthProvider.MICROSOFT, MICROSOFT_CONSUMERS),) or (
        provider == AuthProvider.EMAIL and value in PUBLIC_MAIL_DOMAINS
    ):
        raise Refusal(409, "login_rule_public_domain")
    # Taken: working at any institution, or already asked for by this one.
    # A rule only waiting elsewhere takes nothing (the table's keys hold
    # against a race too).
    taken = db.scalars(
        select(InstitutionLoginRule.id).where(
            InstitutionLoginRule.provider == provider,
            InstitutionLoginRule.value == value,
            InstitutionLoginRule.approved | (InstitutionLoginRule.institution_id == institution.id),
        )
    ).first()
    if taken is not None:
        raise Refusal(409, "login_rule_taken")
    created = InstitutionLoginRule(institution_id=institution.id, provider=provider, value=value, approved=False)
    db.add(created)
    db.flush()
    if approved:
        approve_login_rule(db, created)
    return created


def approve_login_rule(db: Session, rule: InstitutionLoginRule) -> None:
    """The system admin checked the value is this institution's. Others
    waiting for the same value lose it: it cannot be theirs too."""
    rivals = db.scalars(
        select(InstitutionLoginRule).where(
            InstitutionLoginRule.provider == rule.provider,
            InstitutionLoginRule.value == rule.value,
            InstitutionLoginRule.id != rule.id,
        ).with_for_update()
    ).all()
    if any(r.approved for r in rivals):
        raise Refusal(409, "login_rule_taken")
    for rival in rivals:
        db.delete(rival)
    rule.approved = True
    db.flush()


def remove_login_rule(db: Session, rule: InstitutionLoginRule) -> None:
    """The last working rule stays while the institution has users: without
    it they could not sign in, and the value would be free for another
    institution to take them with."""
    if rule.approved:
        # Locked, so two removals at once cannot each see the other rule
        # still there and both go through.
        db.get(Institution, rule.institution_id, with_for_update=True)
        others = db.scalar(
            select(func.count()).select_from(InstitutionLoginRule).where(
                InstitutionLoginRule.institution_id == rule.institution_id,
                InstitutionLoginRule.approved,
                InstitutionLoginRule.id != rule.id,
            )
        )
        # Students: the admin alone (fixing a typo, say) locks no one out.
        users = db.scalar(
            select(func.count()).select_from(User).where(
                User.institution_id == rule.institution_id, User.role == UserRole.STUDENT
            )
        )
        if others == 0 and users > 0:
            raise Refusal(409, "login_rule_last")
    db.delete(rule)
