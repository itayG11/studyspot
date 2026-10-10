"""login rules wait for approval

Nothing proves a domain or tenant belongs to the institution that adds
it, so a rule an institution admin adds waits for the system admin. The
rules already there (Braude's, from the seed) stay approved.

Revision ID: 0e07f3562acc
Revises: 3cc517b2f0eb
Create Date: 2026-10-10 17:58:05.908175

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0e07f3562acc'
down_revision: Union[str, Sequence[str], None] = '3cc517b2f0eb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('institution_login_rules', sa.Column('approved', sa.Boolean(), server_default=sa.text('true'), nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    # Without the column every rule would work: a pending one must not.
    op.execute("DELETE FROM institution_login_rules WHERE NOT approved")
    op.drop_column('institution_login_rules', 'approved')
