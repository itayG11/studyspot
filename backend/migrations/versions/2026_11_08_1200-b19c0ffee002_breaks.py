"""going on a break

Revision ID: b19c0ffee002
Revises: a19c0ffee001
Create Date: 2026-11-08 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b19c0ffee002'
down_revision: Union[str, Sequence[str], None] = 'a19c0ffee001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('check_ins', sa.Column('break_started_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('check_ins', sa.Column('break_until', sa.DateTime(timezone=True), nullable=True))
    op.add_column('check_ins', sa.Column('break_reminded_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('institutions', sa.Column('break_minutes', sa.Integer(), server_default='20', nullable=False))
    op.create_check_constraint(op.f('ck_institutions_break_minutes_range'), 'institutions', 'break_minutes BETWEEN 0 AND 60')
    # A new reason for an ended check-in: the column is text with a CHECK, so the CHECK is replaced.
    op.drop_constraint(op.f('ck_check_ins_check_in_end_reason'), 'check_ins', type_='check')
    op.create_check_constraint(
        op.f('ck_check_ins_check_in_end_reason'), 'check_ins',
        "end_reason IN ('checkout', 'expired', 'moved', 'break_over')",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("UPDATE check_ins SET end_reason = 'expired' WHERE end_reason = 'break_over'")
    op.drop_constraint(op.f('ck_check_ins_check_in_end_reason'), 'check_ins', type_='check')
    op.create_check_constraint(
        op.f('ck_check_ins_check_in_end_reason'), 'check_ins',
        "end_reason IN ('checkout', 'expired', 'moved')",
    )
    op.drop_constraint(op.f('ck_institutions_break_minutes_range'), 'institutions', type_='check')
    op.drop_column('institutions', 'break_minutes')
    op.drop_column('check_ins', 'break_reminded_at')
    op.drop_column('check_ins', 'break_until')
    op.drop_column('check_ins', 'break_started_at')
