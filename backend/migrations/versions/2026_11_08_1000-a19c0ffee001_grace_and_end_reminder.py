"""grace minutes and the end-of-stay reminder

Revision ID: a19c0ffee001
Revises: ff3751ad514d
Create Date: 2026-11-08 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a19c0ffee001'
down_revision: Union[str, Sequence[str], None] = 'ff3751ad514d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('institutions', sa.Column('grace_minutes', sa.Integer(), server_default='5', nullable=False))
    op.create_check_constraint(op.f('ck_institutions_grace_minutes_range'), 'institutions', 'grace_minutes BETWEEN 0 AND 15')
    op.add_column('bookings', sa.Column('reminded_end_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('bookings', 'reminded_end_at')
    op.drop_constraint(op.f('ck_institutions_grace_minutes_range'), 'institutions', type_='check')
    op.drop_column('institutions', 'grace_minutes')
