"""multi-tenant prep: org_id on models, service_tokens, org_settings

Revision ID: 002_multi_tenant
Revises: 001_initial
Create Date: 2026-03-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = '002_multi_tenant'
down_revision: Union[str, None] = '001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create organizations table
    op.create_table(
        'organizations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(200), unique=True, nullable=False),
        sa.Column('slug', sa.String(100), unique=True, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_organizations_slug', 'organizations', ['slug'])

    # Add org_id to users
    op.add_column('users', sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=True))

    # Add org_id to departments
    op.add_column('departments', sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=True))

    # Add org_id to agents
    op.add_column('agents', sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=True))

    # Add org_id to activity_logs
    op.add_column('activity_logs', sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=True))

    # Fix gateways.org_id FK — drop old FK to users.id, add correct FK to organizations.id
    # The old FK constraint name is auto-generated; we need to find and drop it
    op.drop_constraint('gateways_org_id_fkey', 'gateways', type_='foreignkey')
    op.create_foreign_key('gateways_org_id_fkey', 'gateways', 'organizations', ['org_id'], ['id'])

    # Create service_tokens table
    op.create_table(
        'service_tokens',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('token_hash', sa.String(255), nullable=False),
        sa.Column('permissions', JSONB(), nullable=True),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked', sa.Boolean(), server_default='false', nullable=False),
    )

    # Create organization_settings table
    op.create_table(
        'organization_settings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id'), unique=True, nullable=False),
        sa.Column('moonshot_api_key', sa.String(500), nullable=True),
        sa.Column('openai_api_key', sa.String(500), nullable=True),
        sa.Column('anthropic_api_key', sa.String(500), nullable=True),
        sa.Column('default_gateway_id', sa.Integer(), sa.ForeignKey('gateways.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('organization_settings')
    op.drop_table('service_tokens')

    # Restore gateways FK to users
    op.drop_constraint('gateways_org_id_fkey', 'gateways', type_='foreignkey')
    op.create_foreign_key('gateways_org_id_fkey', 'gateways', 'users', ['org_id'], ['id'])

    op.drop_column('activity_logs', 'org_id')
    op.drop_column('agents', 'org_id')
    op.drop_column('departments', 'org_id')
    op.drop_column('users', 'org_id')

    op.drop_index('ix_organizations_slug', 'organizations')
    op.drop_table('organizations')
