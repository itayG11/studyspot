"""remember the demo campus reset day

The live demo's shared admin may add buildings and places; once a day the
demo campus goes back to its seed data. The day of the last reset is kept
here, so a restarted server does not reset again the same day.

Revision ID: d24b0f18abfb
Revises: c97f72843b20
Create Date: 2026-10-09 10:26:00.700951

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd24b0f18abfb'
down_revision: Union[str, Sequence[str], None] = 'c97f72843b20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('institutions', sa.Column('demo_reset_on', sa.Date(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('institutions', 'demo_reset_on')
