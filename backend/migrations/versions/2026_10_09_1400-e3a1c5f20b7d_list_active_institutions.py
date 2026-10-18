"""list active institutions

One site serves many institutions. A public list shows the ones that are
ready; a new institution stays hidden until its admin marks it active.
The demo campus is listed from the start. Braude is not: it waits for the
college to agree.

Revision ID: e3a1c5f20b7d
Revises: d24b0f18abfb
Create Date: 2026-10-09 14:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3a1c5f20b7d'
down_revision: Union[str, Sequence[str], None] = 'd24b0f18abfb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'institutions',
        sa.Column('is_active', sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.execute("UPDATE institutions SET is_active = true WHERE slug = 'demo'")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('institutions', 'is_active')
