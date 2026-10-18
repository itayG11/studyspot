"""add users and check-ins

Users (minimal until stage 5), check-ins with partial unique indexes
(one open check-in per user and per seat), and places.code_version
for revoking printed check-in codes.

Revision ID: 00ab1baffeef
Revises: 4646b17bce31
Create Date: 2026-10-07 11:08:42.424179

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '00ab1baffeef'
down_revision: Union[str, Sequence[str], None] = '4646b17bce31'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # First the targets that the check_ins foreign keys point to.
    op.add_column('places', sa.Column('code_version', sa.Integer(), server_default='1', nullable=False))
    op.create_check_constraint(op.f('ck_places_code_version_positive'), 'places', 'code_version >= 1')
    op.create_unique_constraint(op.f('uq_seats_id_place_id'), 'seats', ['id', 'place_id'])
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('institution_id', sa.Integer(), nullable=False),
    sa.Column('email', sa.String(length=320), nullable=False),
    sa.Column('display_name', sa.String(length=100), nullable=False),
    sa.CheckConstraint("btrim(display_name) <> ''", name=op.f('ck_users_display_name_not_blank')),
    sa.CheckConstraint('email = lower(email)', name=op.f('ck_users_email_lowercase')),
    sa.ForeignKeyConstraint(['institution_id'], ['institutions.id'], name=op.f('fk_users_institution_id_institutions'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users')),
    sa.UniqueConstraint('email', name=op.f('uq_users_email')),
    sa.UniqueConstraint('id', 'institution_id', name=op.f('uq_users_id_institution_id'))
    )
    op.create_index(op.f('ix_users_institution_id'), 'users', ['institution_id'], unique=False)
    op.create_table('check_ins',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('institution_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('place_id', sa.Integer(), nullable=False),
    sa.Column('seat_id', sa.Integer(), nullable=True),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('end_reason', sa.Enum('checkout', 'expired', 'moved', name='check_in_end_reason', native_enum=False, create_constraint=False, length=32), nullable=True),
    sa.CheckConstraint("end_reason IN ('checkout', 'expired', 'moved')", name=op.f('ck_check_ins_check_in_end_reason')),
    sa.CheckConstraint('(ended_at IS NULL) = (end_reason IS NULL)', name=op.f('ck_check_ins_ended_with_reason')),
    sa.CheckConstraint('ended_at IS NULL OR ended_at >= started_at', name=op.f('ck_check_ins_ends_after_start')),
    sa.CheckConstraint('expires_at > started_at', name=op.f('ck_check_ins_expires_after_start')),
    sa.ForeignKeyConstraint(['place_id', 'institution_id'], ['places.id', 'places.institution_id'], name='fk_check_ins_place', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['seat_id', 'place_id'], ['seats.id', 'seats.place_id'], name='fk_check_ins_seat', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id', 'institution_id'], ['users.id', 'users.institution_id'], name='fk_check_ins_user', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_check_ins'))
    )
    op.create_index('ix_check_ins_open_by_place', 'check_ins', ['place_id'], unique=False, postgresql_where=sa.text('ended_at IS NULL'))
    op.create_index('uq_check_ins_one_active_per_seat', 'check_ins', ['seat_id'], unique=True, postgresql_where=sa.text('ended_at IS NULL AND seat_id IS NOT NULL'))
    op.create_index('uq_check_ins_one_active_per_user', 'check_ins', ['user_id'], unique=True, postgresql_where=sa.text('ended_at IS NULL'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('uq_check_ins_one_active_per_user', table_name='check_ins', postgresql_where=sa.text('ended_at IS NULL'))
    op.drop_index('uq_check_ins_one_active_per_seat', table_name='check_ins', postgresql_where=sa.text('ended_at IS NULL AND seat_id IS NOT NULL'))
    op.drop_index('ix_check_ins_open_by_place', table_name='check_ins', postgresql_where=sa.text('ended_at IS NULL'))
    op.drop_table('check_ins')
    op.drop_index(op.f('ix_users_institution_id'), table_name='users')
    op.drop_table('users')
    # Last, after check_ins (which depends on them) is gone.
    op.drop_constraint(op.f('uq_seats_id_place_id'), 'seats', type_='unique')
    op.drop_column('places', 'code_version')
