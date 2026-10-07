"""create campus tables

Institutions, buildings, study places, lab seats, opening hours and
special periods. Enum columns are plain VARCHAR; each has one named
CHECK constraint listing the allowed values.

Revision ID: 4646b17bce31
Revises: 
Create Date: 2026-10-07 10:44:32.831133

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4646b17bce31'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('institutions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('slug', sa.String(length=64), nullable=False),
    sa.Column('timezone', sa.String(length=64), nullable=False),
    sa.CheckConstraint("slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'", name=op.f('ck_institutions_slug_format')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_institutions')),
    sa.UniqueConstraint('slug', name=op.f('uq_institutions_slug'))
    )
    op.create_table('buildings',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('institution_id', sa.Integer(), nullable=False),
    sa.Column('code', sa.String(length=16), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=True),
    sa.Column('floors_count', sa.Integer(), nullable=False),
    sa.Column('status', sa.Enum('active', 'new', 'under_construction', name='building_status', native_enum=False, create_constraint=False, length=32), nullable=False),
    sa.Column('latitude', sa.Numeric(precision=9, scale=6), nullable=True),
    sa.Column('longitude', sa.Numeric(precision=9, scale=6), nullable=True),
    sa.CheckConstraint("btrim(code) <> ''", name=op.f('ck_buildings_code_not_blank')),
    sa.CheckConstraint("status IN ('active', 'new', 'under_construction')", name=op.f('ck_buildings_building_status')),
    sa.CheckConstraint('(latitude IS NULL) = (longitude IS NULL)', name=op.f('ck_buildings_coordinates_pair')),
    sa.CheckConstraint('floors_count >= 1', name=op.f('ck_buildings_floors_count_positive')),
    sa.CheckConstraint('latitude BETWEEN -90 AND 90', name=op.f('ck_buildings_latitude_range')),
    sa.CheckConstraint('longitude BETWEEN -180 AND 180', name=op.f('ck_buildings_longitude_range')),
    sa.ForeignKeyConstraint(['institution_id'], ['institutions.id'], name=op.f('fk_buildings_institution_id_institutions'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_buildings')),
    sa.UniqueConstraint('id', 'institution_id', name=op.f('uq_buildings_id_institution_id')),
    sa.UniqueConstraint('institution_id', 'code', name=op.f('uq_buildings_institution_id_code'))
    )
    op.create_table('special_periods',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('institution_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('starts_on', sa.Date(), nullable=False),
    sa.Column('ends_on', sa.Date(), nullable=False),
    sa.CheckConstraint("btrim(name) <> ''", name=op.f('ck_special_periods_name_not_blank')),
    sa.CheckConstraint('starts_on <= ends_on', name=op.f('ck_special_periods_starts_before_ends')),
    sa.ForeignKeyConstraint(['institution_id'], ['institutions.id'], name=op.f('fk_special_periods_institution_id_institutions'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_special_periods')),
    sa.UniqueConstraint('id', 'institution_id', name=op.f('uq_special_periods_id_institution_id')),
    sa.UniqueConstraint('institution_id', 'name', name=op.f('uq_special_periods_institution_id_name'))
    )
    op.create_table('places',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('institution_id', sa.Integer(), nullable=False),
    sa.Column('building_id', sa.Integer(), nullable=False),
    sa.Column('kind', sa.Enum('group_room', 'open_area', 'library', 'computer_lab', name='place_kind', native_enum=False, create_constraint=False, length=32), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('floor', sa.Integer(), nullable=False),
    sa.Column('location_note', sa.String(length=300), nullable=True),
    sa.Column('capacity', sa.Integer(), nullable=False),
    sa.Column('lab_rows', sa.Integer(), nullable=True),
    sa.Column('lab_cols', sa.Integer(), nullable=True),
    sa.CheckConstraint("(kind = 'computer_lab' AND lab_rows IS NOT NULL AND lab_cols IS NOT NULL AND lab_rows > 0 AND lab_cols > 0 AND capacity = lab_rows * lab_cols) OR (kind <> 'computer_lab' AND lab_rows IS NULL AND lab_cols IS NULL)", name=op.f('ck_places_lab_layout')),
    sa.CheckConstraint("btrim(name) <> ''", name=op.f('ck_places_name_not_blank')),
    sa.CheckConstraint("kind IN ('group_room', 'open_area', 'library', 'computer_lab')", name=op.f('ck_places_place_kind')),
    sa.CheckConstraint('capacity > 0', name=op.f('ck_places_capacity_positive')),
    sa.CheckConstraint('floor >= 0', name=op.f('ck_places_floor_not_negative')),
    sa.ForeignKeyConstraint(['building_id', 'institution_id'], ['buildings.id', 'buildings.institution_id'], name=op.f('fk_places_building_id_institution_id_buildings'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_places')),
    sa.UniqueConstraint('building_id', 'name', name=op.f('uq_places_building_id_name')),
    sa.UniqueConstraint('id', 'institution_id', name=op.f('uq_places_id_institution_id'))
    )
    op.create_index(op.f('ix_places_institution_id'), 'places', ['institution_id'], unique=False)
    op.create_table('opening_hours',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('place_id', sa.Integer(), nullable=False),
    sa.Column('weekday', sa.SmallInteger(), nullable=False),
    sa.Column('opens', sa.Time(), nullable=False),
    sa.Column('closes', sa.Time(), nullable=False),
    sa.CheckConstraint('opens < closes', name=op.f('ck_opening_hours_opens_before_closes')),
    sa.CheckConstraint('weekday BETWEEN 0 AND 6', name=op.f('ck_opening_hours_weekday_range')),
    sa.ForeignKeyConstraint(['place_id'], ['places.id'], name=op.f('fk_opening_hours_place_id_places'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_opening_hours')),
    sa.UniqueConstraint('place_id', 'weekday', name=op.f('uq_opening_hours_place_id_weekday'))
    )
    op.create_table('seats',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('place_id', sa.Integer(), nullable=False),
    sa.Column('row', sa.Integer(), nullable=False),
    sa.Column('col', sa.Integer(), nullable=False),
    sa.Column('label', sa.String(length=16), nullable=False),
    sa.CheckConstraint('col >= 1', name=op.f('ck_seats_col_positive')),
    sa.CheckConstraint('row >= 1', name=op.f('ck_seats_row_positive')),
    sa.ForeignKeyConstraint(['place_id'], ['places.id'], name=op.f('fk_seats_place_id_places'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_seats')),
    sa.UniqueConstraint('place_id', 'label', name=op.f('uq_seats_place_id_label')),
    sa.UniqueConstraint('place_id', 'row', 'col', name=op.f('uq_seats_place_id_row_col'))
    )
    op.create_table('special_period_places',
    sa.Column('period_id', sa.Integer(), nullable=False),
    sa.Column('place_id', sa.Integer(), nullable=False),
    sa.Column('institution_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['period_id', 'institution_id'], ['special_periods.id', 'special_periods.institution_id'], name='fk_special_period_places_period', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['place_id', 'institution_id'], ['places.id', 'places.institution_id'], name='fk_special_period_places_place', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('period_id', 'place_id', name=op.f('pk_special_period_places'))
    )
    op.create_index(op.f('ix_special_period_places_place_id'), 'special_period_places', ['place_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_special_period_places_place_id'), table_name='special_period_places')
    op.drop_table('special_period_places')
    op.drop_table('seats')
    op.drop_table('opening_hours')
    op.drop_index(op.f('ix_places_institution_id'), table_name='places')
    op.drop_table('places')
    op.drop_table('special_periods')
    op.drop_table('buildings')
    op.drop_table('institutions')
