"""add place details and amenities

What a place is like: its atmosphere (quiet, conversation, mixed), who it
suits (solo, group, both), and its equipment, one row per amenity. The
Braude values are demo data for now; details_are_demo says so.

Revision ID: b7a77d148a72
Revises: 2be71726e377
Create Date: 2026-10-07 15:45:51.016477

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7a77d148a72'
down_revision: Union[str, Sequence[str], None] = '2be71726e377'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('place_amenities',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('place_id', sa.Integer(), nullable=False),
    sa.Column('amenity', sa.Enum('outlets', 'whiteboard', 'projector', 'screen', 'computers', 'ac', 'daylight', 'printer', name='amenity', native_enum=False, create_constraint=False, length=32), nullable=False),
    sa.CheckConstraint("amenity IN ('outlets', 'whiteboard', 'projector', 'screen', 'computers', 'ac', 'daylight', 'printer')", name=op.f('ck_place_amenities_amenity')),
    sa.ForeignKeyConstraint(['place_id'], ['places.id'], name=op.f('fk_place_amenities_place_id_places'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_place_amenities')),
    sa.UniqueConstraint('place_id', 'amenity', name=op.f('uq_place_amenities_place_id_amenity'))
    )
    op.add_column('places', sa.Column('atmosphere', sa.Enum('quiet', 'conversation', 'mixed', name='place_atmosphere', native_enum=False, create_constraint=False, length=32), server_default='mixed', nullable=False))
    op.add_column('places', sa.Column('suited_for', sa.Enum('solo', 'group', 'both', name='suited_for', native_enum=False, create_constraint=False, length=32), server_default='both', nullable=False))
    op.add_column('places', sa.Column('details_are_demo', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    # Autogenerate does not add the CHECK of an enum column on an existing table.
    op.create_check_constraint(op.f('ck_places_place_atmosphere'), 'places', "atmosphere IN ('quiet', 'conversation', 'mixed')")
    op.create_check_constraint(op.f('ck_places_suited_for'), 'places', "suited_for IN ('solo', 'group', 'both')")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(op.f('ck_places_suited_for'), 'places', type_='check')
    op.drop_constraint(op.f('ck_places_place_atmosphere'), 'places', type_='check')
    op.drop_column('places', 'details_are_demo')
    op.drop_column('places', 'suited_for')
    op.drop_column('places', 'atmosphere')
    op.drop_table('place_amenities')
