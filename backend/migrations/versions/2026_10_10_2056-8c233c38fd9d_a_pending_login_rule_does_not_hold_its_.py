"""a pending login rule does not hold its value

Only an approved rule owns its domain or tenant. Several institutions may
wait for the same value; approving one removes the others (app.campus_setup).

Revision ID: 8c233c38fd9d
Revises: 0e07f3562acc
Create Date: 2026-10-10 20:56:11.870152

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8c233c38fd9d'
down_revision: Union[str, Sequence[str], None] = '0e07f3562acc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint(op.f('uq_institution_login_rules_provider_value'), 'institution_login_rules', type_='unique')
    op.create_index('uq_institution_login_rules_approved_value', 'institution_login_rules', ['provider', 'value'], unique=True, postgresql_where=sa.text('approved'))
    op.create_unique_constraint(op.f('uq_institution_login_rules_institution_id_provider_value'), 'institution_login_rules', ['institution_id', 'provider', 'value'])


def downgrade() -> None:
    """Downgrade schema."""
    # The old key allows one row per value: drop pending rows that share a
    # value with another row, keeping the approved one (or the oldest).
    op.execute(
        """
        DELETE FROM institution_login_rules r
        WHERE NOT r.approved AND EXISTS (
            SELECT 1 FROM institution_login_rules o
            WHERE o.provider = r.provider AND o.value = r.value AND o.id <> r.id
              AND (o.approved OR o.id < r.id)
        )
        """
    )
    op.drop_constraint(op.f('uq_institution_login_rules_institution_id_provider_value'), 'institution_login_rules', type_='unique')
    op.drop_index('uq_institution_login_rules_approved_value', table_name='institution_login_rules', postgresql_where=sa.text('approved'))
    op.create_unique_constraint(op.f('uq_institution_login_rules_provider_value'), 'institution_login_rules', ['provider', 'value'], postgresql_nulls_not_distinct=False)
