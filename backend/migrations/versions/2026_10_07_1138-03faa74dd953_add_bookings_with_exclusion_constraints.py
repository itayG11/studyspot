"""add bookings with exclusion constraints

Bookings of group rooms and lab seats. Two EXCLUDE constraints make the
database refuse overlapping active bookings of the same room or seat.
check_ins.booking_id links a check-in to the booking it confirms.

Revision ID: 03faa74dd953
Revises: 00ab1baffeef
Create Date: 2026-10-07 11:38:15.158883

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '03faa74dd953'
down_revision: Union[str, Sequence[str], None] = '00ab1baffeef'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # btree_gist lets one GiST index compare integers with "=" next to
    # ranges with "&&", which the EXCLUDE constraints below need.
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.create_table('bookings',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('institution_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('place_id', sa.Integer(), nullable=False),
    sa.Column('seat_id', sa.Integer(), nullable=True),
    sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('ends_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('status', sa.Enum('booked', 'checked_in', 'completed', 'cancelled', 'no_show', name='booking_status', native_enum=False, create_constraint=False, length=32), nullable=False),
    sa.Column('source', sa.Enum('advance', 'walk_in', name='booking_source', native_enum=False, create_constraint=False, length=32), nullable=False),
    postgresql.ExcludeConstraint((sa.text('place_id'), '='), (sa.text("tstzrange(starts_at, ends_at, '[)')"), '&&'), where=sa.text("seat_id IS NULL AND status IN ('booked', 'checked_in')"), using='gist', name='ex_bookings_room_overlap'),
    postgresql.ExcludeConstraint((sa.text('seat_id'), '='), (sa.text("tstzrange(starts_at, ends_at, '[)')"), '&&'), where=sa.text("seat_id IS NOT NULL AND status IN ('booked', 'checked_in')"), using='gist', name='ex_bookings_seat_overlap'),
    sa.CheckConstraint("source IN ('advance', 'walk_in')", name=op.f('ck_bookings_booking_source')),
    sa.CheckConstraint("status IN ('booked', 'checked_in', 'completed', 'cancelled', 'no_show')", name=op.f('ck_bookings_booking_status')),
    sa.CheckConstraint('ends_at > starts_at', name=op.f('ck_bookings_ends_after_start')),
    sa.ForeignKeyConstraint(['place_id', 'institution_id'], ['places.id', 'places.institution_id'], name='fk_bookings_place', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['seat_id', 'place_id'], ['seats.id', 'seats.place_id'], name='fk_bookings_seat', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id', 'institution_id'], ['users.id', 'users.institution_id'], name='fk_bookings_user', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_bookings'))
    )
    op.create_index('ix_bookings_user_status', 'bookings', ['user_id', 'status'], unique=False)
    op.add_column('check_ins', sa.Column('booking_id', sa.Integer(), nullable=True))
    op.create_unique_constraint(op.f('uq_check_ins_booking_id'), 'check_ins', ['booking_id'])
    op.create_foreign_key('fk_check_ins_booking', 'check_ins', 'bookings', ['booking_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    """Downgrade schema."""
    # btree_gist is left installed: other databases objects may use it.
    op.drop_constraint('fk_check_ins_booking', 'check_ins', type_='foreignkey')
    op.drop_constraint(op.f('uq_check_ins_booking_id'), 'check_ins', type_='unique')
    op.drop_column('check_ins', 'booking_id')
    op.drop_index('ix_bookings_user_status', table_name='bookings')
    op.drop_table('bookings')
