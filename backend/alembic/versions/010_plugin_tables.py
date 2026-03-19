"""Add plugin tables (installed_plugins, agent_plugins, plugin_executions)

Revision ID: 010_plugin_tables
Revises: 009_workflow_tables
Create Date: 2026-03-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "010_plugin_tables"
down_revision: Union[str, None] = "009_workflow_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. installed_plugins ──
    op.create_table(
        'installed_plugins',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('plugin_slug', sa.String(100), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('emoji', sa.String(10), server_default='🔌'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('plugin_type', sa.String(30), server_default='api_connector'),
        sa.Column('manifest', JSONB(), nullable=False),
        sa.Column('credentials_encrypted', sa.LargeBinary(), nullable=True),
        sa.Column('settings', JSONB(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('is_configured', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('marketplace_template_slug', sa.String(100), nullable=True),
        sa.Column('installed_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('installed_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('org_id', 'plugin_slug', name='uq_org_plugin_slug'),
    )
    op.create_index('ix_installed_plugins_org_id', 'installed_plugins', ['org_id'])

    # ── 2. agent_plugins ──
    op.create_table(
        'agent_plugins',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('agent_id', sa.Integer(), sa.ForeignKey('agents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('plugin_id', sa.Integer(), sa.ForeignKey('installed_plugins.id', ondelete='CASCADE'), nullable=False),
        sa.Column('capabilities', JSONB(), nullable=True),
        sa.UniqueConstraint('agent_id', 'plugin_id', name='uq_agent_plugin'),
    )
    op.create_index('ix_agent_plugins_agent_id', 'agent_plugins', ['agent_id'])

    # ── 3. plugin_executions ──
    op.create_table(
        'plugin_executions',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('plugin_id', sa.Integer(), sa.ForeignKey('installed_plugins.id', ondelete='SET NULL'), nullable=True),
        sa.Column('agent_id', sa.Integer(), sa.ForeignKey('agents.id', ondelete='SET NULL'), nullable=True),
        sa.Column('capability_id', sa.String(100), nullable=False),
        sa.Column('capability_name', sa.String(200), nullable=True),
        sa.Column('request_data', JSONB(), nullable=True),
        sa.Column('response_summary', JSONB(), nullable=True),
        sa.Column('status', sa.String(20), server_default='pending'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('duration_ms', sa.Integer(), nullable=True),
        sa.Column('executed_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_plugin_executions_org_id', 'plugin_executions', ['org_id'])
    op.create_index('ix_plugin_executions_plugin_id', 'plugin_executions', ['plugin_id'])


def downgrade() -> None:
    op.drop_index('ix_plugin_executions_plugin_id', table_name='plugin_executions')
    op.drop_index('ix_plugin_executions_org_id', table_name='plugin_executions')
    op.drop_table('plugin_executions')
    op.drop_index('ix_agent_plugins_agent_id', table_name='agent_plugins')
    op.drop_table('agent_plugins')
    op.drop_index('ix_installed_plugins_org_id', table_name='installed_plugins')
    op.drop_table('installed_plugins')
