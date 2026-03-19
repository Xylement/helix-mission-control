"""Add installed_templates table and agent marketplace_template_slug

Revision ID: 008_marketplace_installed_templates
Revises: 007_custom_skills
Create Date: 2026-03-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "008_marketplace_installed_templates"
down_revision: Union[str, None] = "007_custom_skills"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Create installed_templates table ──
    op.create_table(
        'installed_templates',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('template_slug', sa.String(100), nullable=False),
        sa.Column('template_type', sa.String(20), nullable=False),
        sa.Column('template_name', sa.String(200), nullable=False),
        sa.Column('template_version', sa.String(20), nullable=False),
        sa.Column('manifest', JSONB(), nullable=False),
        sa.Column('local_resource_id', sa.Integer(), nullable=False),
        sa.Column('local_resource_type', sa.String(20), nullable=False),
        sa.Column('installed_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('installed_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
    )
    op.create_index('ix_installed_templates_org_slug', 'installed_templates', ['org_id', 'template_slug'])

    # ── 2. Add marketplace_template_slug to agents ──
    op.add_column('agents', sa.Column('marketplace_template_slug', sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column('agents', 'marketplace_template_slug')
    op.drop_index('ix_installed_templates_org_slug', table_name='installed_templates')
    op.drop_table('installed_templates')
