"""admin invites

The links that give a new institution its first admin. Only an HMAC of
each link's token is kept; a link is good for 7 days and for one use.

Revision ID: 3cc517b2f0eb
Revises: e3a1c5f20b7d
Create Date: 2026-10-10 15:59:19.600241

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3cc517b2f0eb'
down_revision: Union[str, Sequence[str], None] = 'e3a1c5f20b7d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('admin_invites',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('institution_id', sa.Integer(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('used_by', sa.Integer(), nullable=True),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint('expires_at > created_at', name=op.f('ck_admin_invites_expires_after_creation')),
    sa.CheckConstraint('used_at IS NULL OR revoked_at IS NULL', name=op.f('ck_admin_invites_used_or_revoked')),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], name=op.f('fk_admin_invites_created_by_users'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['institution_id'], ['institutions.id'], name=op.f('fk_admin_invites_institution_id_institutions'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['used_by'], ['users.id'], name=op.f('fk_admin_invites_used_by_users'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_admin_invites')),
    sa.UniqueConstraint('token_hash', name=op.f('uq_admin_invites_token_hash'))
    )
    op.create_index(op.f('ix_admin_invites_institution_id'), 'admin_invites', ['institution_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_admin_invites_institution_id'), table_name='admin_invites')
    op.drop_table('admin_invites')
