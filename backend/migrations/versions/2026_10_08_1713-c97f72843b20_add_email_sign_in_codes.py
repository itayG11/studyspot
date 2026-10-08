"""add email sign-in codes

Sign-in with a one-time code sent to a college address. A new provider,
"email", for identities and login rules (the rule's value is the exact
domain of the address), and a table of the codes sent, which keeps an
HMAC of each code, never the code.

Revision ID: c97f72843b20
Revises: b7a77d148a72
Create Date: 2026-10-08 17:13:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c97f72843b20'
down_revision: Union[str, Sequence[str], None] = 'b7a77d148a72'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_ALL = "provider IN ('microsoft', 'google', 'demo')"
OLD_REAL = "provider IN ('microsoft', 'google')"
NEW_ALL = "provider IN ('microsoft', 'google', 'demo', 'email')"
NEW_REAL = "provider IN ('microsoft', 'google', 'email')"


def _replace_checks(all_providers: str, real_providers: str) -> None:
    for table in ("user_identities", "institution_login_rules"):
        name = op.f(f"ck_{table}_auth_provider")
        op.drop_constraint(name, table, type_="check")
        op.create_check_constraint(name, table, all_providers)
    name = op.f("ck_institution_login_rules_real_provider")
    op.drop_constraint(name, "institution_login_rules", type_="check")
    op.create_check_constraint(name, "institution_login_rules", real_providers)


def upgrade() -> None:
    """Upgrade schema."""
    _replace_checks(NEW_ALL, NEW_REAL)
    op.create_table(
        'email_sign_in_codes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=320), nullable=False),
        sa.Column('code_hash', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('attempts', sa.Integer(), server_default='0', nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint('attempts >= 0', name=op.f('ck_email_sign_in_codes_attempts_not_negative')),
        sa.CheckConstraint('email = lower(email)', name=op.f('ck_email_sign_in_codes_email_lowercase')),
        sa.CheckConstraint('expires_at > created_at', name=op.f('ck_email_sign_in_codes_expires_after_creation')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_email_sign_in_codes')),
    )
    op.create_index(op.f('ix_email_sign_in_codes_created_at'), 'email_sign_in_codes', ['created_at'], unique=False)
    op.create_index(op.f('ix_email_sign_in_codes_email'), 'email_sign_in_codes', ['email'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_email_sign_in_codes_email'), table_name='email_sign_in_codes')
    op.drop_index(op.f('ix_email_sign_in_codes_created_at'), table_name='email_sign_in_codes')
    op.drop_table('email_sign_in_codes')
    # Email users cannot exist under the old rules; remove them (and, by
    # cascade, their identities, sessions, check-ins and bookings).
    op.execute(
        "DELETE FROM users WHERE id IN "
        "(SELECT user_id FROM user_identities WHERE provider = 'email')"
    )
    op.execute("DELETE FROM institution_login_rules WHERE provider = 'email'")
    _replace_checks(OLD_ALL, OLD_REAL)
