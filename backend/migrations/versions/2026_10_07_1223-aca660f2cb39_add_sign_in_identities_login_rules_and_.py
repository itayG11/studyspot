"""add sign-in identities, login rules and sessions

Users get a role. user_identities holds the provider identity (never the
email), institution_login_rules maps a Microsoft tenant or Google domain
to one institution, and sessions keeps hashed refresh tokens. The email
is no longer unique: it is information, not identity.

Revision ID: aca660f2cb39
Revises: 03faa74dd953
Create Date: 2026-10-07 12:23:21.527435

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'aca660f2cb39'
down_revision: Union[str, Sequence[str], None] = '03faa74dd953'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('institution_login_rules',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('institution_id', sa.Integer(), nullable=False),
    sa.Column('provider', sa.Enum('microsoft', 'google', name='auth_provider', native_enum=False, create_constraint=False, length=32), nullable=False),
    sa.Column('value', sa.String(length=255), nullable=False),
    sa.CheckConstraint("provider IN ('microsoft', 'google')", name=op.f('ck_institution_login_rules_auth_provider')),
    sa.CheckConstraint("value = lower(value) AND btrim(value) <> ''", name=op.f('ck_institution_login_rules_value_lowercase')),
    sa.ForeignKeyConstraint(['institution_id'], ['institutions.id'], name=op.f('fk_institution_login_rules_institution_id_institutions'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_institution_login_rules')),
    sa.UniqueConstraint('provider', 'value', name=op.f('uq_institution_login_rules_provider_value'))
    )
    op.create_index(op.f('ix_institution_login_rules_institution_id'), 'institution_login_rules', ['institution_id'], unique=False)
    op.create_table('sessions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('replaced_by_id', sa.Integer(), nullable=True),
    sa.CheckConstraint('expires_at > created_at', name=op.f('ck_sessions_expires_after_creation')),
    sa.ForeignKeyConstraint(['replaced_by_id'], ['sessions.id'], name=op.f('fk_sessions_replaced_by_id_sessions'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_sessions_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_sessions')),
    sa.UniqueConstraint('token_hash', name=op.f('uq_sessions_token_hash'))
    )
    op.create_index(op.f('ix_sessions_user_id'), 'sessions', ['user_id'], unique=False)
    op.create_table('user_identities',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('provider', sa.Enum('microsoft', 'google', name='auth_provider', native_enum=False, create_constraint=False, length=32), nullable=False),
    sa.Column('subject', sa.String(length=255), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("provider IN ('microsoft', 'google')", name=op.f('ck_user_identities_auth_provider')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_user_identities_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_user_identities')),
    sa.UniqueConstraint('provider', 'subject', name=op.f('uq_user_identities_provider_subject'))
    )
    op.create_index(op.f('ix_user_identities_user_id'), 'user_identities', ['user_id'], unique=False)
    op.add_column('users', sa.Column('role', sa.Enum('student', 'institution_admin', 'system_admin', name='user_role', native_enum=False, create_constraint=False, length=32), server_default='student', nullable=False))
    op.add_column('users', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False))
    op.add_column('users', sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint(
        op.f('ck_users_user_role'), 'users', "role IN ('student', 'institution_admin', 'system_admin')"
    )
    op.drop_constraint(op.f('uq_users_email'), 'users', type_='unique')


def downgrade() -> None:
    """Downgrade schema."""
    op.create_unique_constraint(op.f('uq_users_email'), 'users', ['email'], postgresql_nulls_not_distinct=False)
    op.drop_column('users', 'last_login_at')
    op.drop_column('users', 'created_at')
    op.drop_column('users', 'role')
    op.drop_index(op.f('ix_user_identities_user_id'), table_name='user_identities')
    op.drop_table('user_identities')
    op.drop_index(op.f('ix_sessions_user_id'), table_name='sessions')
    op.drop_table('sessions')
    op.drop_index(op.f('ix_institution_login_rules_institution_id'), table_name='institution_login_rules')
    op.drop_table('institution_login_rules')
