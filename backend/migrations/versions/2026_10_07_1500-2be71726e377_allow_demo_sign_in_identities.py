"""allow demo sign-in identities

The demo sign-in (DEMO_LOGIN_ENABLED) stores its two fixed users under
provider "demo". user_identities accepts the new value. A login rule
must still name a real provider: demo users are never matched by a rule.

Revision ID: 2be71726e377
Revises: aca660f2cb39
Create Date: 2026-10-07 15:00:00

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '2be71726e377'
down_revision: Union[str, Sequence[str], None] = 'aca660f2cb39'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ALL = "provider IN ('microsoft', 'google', 'demo')"
REAL = "provider IN ('microsoft', 'google')"


def upgrade() -> None:
    """Upgrade schema."""
    for table in ("user_identities", "institution_login_rules"):
        name = op.f(f"ck_{table}_auth_provider")
        op.drop_constraint(name, table, type_="check")
        op.create_check_constraint(name, table, ALL)
    op.create_check_constraint(
        op.f("ck_institution_login_rules_real_provider"), "institution_login_rules", REAL
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Demo users cannot exist under the old rule; remove them (and, by
    # cascade, their identities, sessions, check-ins and bookings).
    op.execute(
        "DELETE FROM users WHERE id IN "
        "(SELECT user_id FROM user_identities WHERE provider = 'demo')"
    )
    op.drop_constraint(
        op.f("ck_institution_login_rules_real_provider"), "institution_login_rules", type_="check"
    )
    for table in ("user_identities", "institution_login_rules"):
        name = op.f(f"ck_{table}_auth_provider")
        op.drop_constraint(name, table, type_="check")
        op.create_check_constraint(name, table, REAL)
