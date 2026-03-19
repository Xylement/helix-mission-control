"""Add workflow tables and task metadata column

Revision ID: 009_workflow_tables
Revises: 008_marketplace_installed_templates
Create Date: 2026-03-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

revision: str = "009_workflow_tables"
down_revision: Union[str, None] = "008_marketplace_installed_templates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Add metadata JSONB column to tasks ──
    op.add_column('tasks', sa.Column('metadata', JSONB(), nullable=True))

    # ── 2. Create workflows table ──
    op.create_table(
        'workflows',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('trigger_type', sa.String(20), server_default='manual'),
        sa.Column('trigger_config', JSONB(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('marketplace_template_slug', sa.String(100), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_workflows_org_id', 'workflows', ['org_id'])

    # ── 3. Create workflow_steps table ──
    op.create_table(
        'workflow_steps',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('workflow_id', sa.Integer(), sa.ForeignKey('workflows.id', ondelete='CASCADE'), nullable=False),
        sa.Column('step_id', sa.String(50), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('agent_id', sa.Integer(), sa.ForeignKey('agents.id', ondelete='SET NULL'), nullable=True),
        sa.Column('action_prompt', sa.Text(), nullable=True),
        sa.Column('depends_on', ARRAY(sa.String(50)), server_default='{}'),
        sa.Column('timeout_minutes', sa.Integer(), server_default='60'),
        sa.Column('requires_approval', sa.Boolean(), server_default='false'),
        sa.Column('step_order', sa.Integer(), server_default='0'),
        sa.Column('config', JSONB(), nullable=True),
        sa.Column('position_x', sa.Integer(), server_default='0'),
        sa.Column('position_y', sa.Integer(), server_default='0'),
    )
    op.create_index('ix_workflow_steps_workflow_id', 'workflow_steps', ['workflow_id'])

    # ── 4. Create workflow_executions table ──
    op.create_table(
        'workflow_executions',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('workflow_id', sa.Integer(), sa.ForeignKey('workflows.id', ondelete='CASCADE'), nullable=False),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(20), server_default='running'),
        sa.Column('input_data', JSONB(), nullable=True),
        sa.Column('output_data', JSONB(), nullable=True),
        sa.Column('started_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
    )
    op.create_index('ix_workflow_executions_workflow_id', 'workflow_executions', ['workflow_id'])
    op.create_index('ix_workflow_executions_org_id', 'workflow_executions', ['org_id'])

    # ── 5. Create workflow_step_executions table ──
    op.create_table(
        'workflow_step_executions',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('execution_id', sa.Integer(), sa.ForeignKey('workflow_executions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('step_id', sa.String(50), nullable=False),
        sa.Column('task_id', sa.Integer(), sa.ForeignKey('tasks.id', ondelete='SET NULL'), nullable=True),
        sa.Column('status', sa.String(20), server_default='pending'),
        sa.Column('input_data', JSONB(), nullable=True),
        sa.Column('output_data', JSONB(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
    )
    op.create_index('ix_workflow_step_executions_execution_id', 'workflow_step_executions', ['execution_id'])
    op.create_index('ix_workflow_step_executions_task_id', 'workflow_step_executions', ['task_id'])


def downgrade() -> None:
    op.drop_index('ix_workflow_step_executions_task_id', table_name='workflow_step_executions')
    op.drop_index('ix_workflow_step_executions_execution_id', table_name='workflow_step_executions')
    op.drop_table('workflow_step_executions')
    op.drop_index('ix_workflow_executions_org_id', table_name='workflow_executions')
    op.drop_index('ix_workflow_executions_workflow_id', table_name='workflow_executions')
    op.drop_table('workflow_executions')
    op.drop_index('ix_workflow_steps_workflow_id', table_name='workflow_steps')
    op.drop_table('workflow_steps')
    op.drop_index('ix_workflows_org_id', table_name='workflows')
    op.drop_table('workflows')
    op.drop_column('tasks', 'metadata')
