"""Batch B features: skills, ai_models, board_permissions, user avatar, agent ai_model_id

Revision ID: 003_batch_b
Revises: 002_multi_tenant
Create Date: 2026-03-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = '003_batch_b'
down_revision: Union[str, None] = '002_multi_tenant'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Skills tables ---
    op.create_table(
        'skills',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('source_type', sa.String(50), server_default='custom', nullable=False),
        sa.Column('source_url', sa.String(500), nullable=True),
        sa.Column('version', sa.String(50), server_default='1.0.0', nullable=False),
        sa.Column('config', JSONB(), nullable=True),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('installed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_skills_name', 'skills', ['name'])

    op.create_table(
        'agent_skills',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('agent_id', sa.Integer(), sa.ForeignKey('agents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('skill_id', sa.Integer(), sa.ForeignKey('skills.id', ondelete='CASCADE'), nullable=False),
        sa.Column('enabled', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('config_override', JSONB(), nullable=True),
        sa.Column('assigned_at', sa.DateTime(timezone=True), nullable=True),
    )

    # --- AI Models table ---
    op.create_table(
        'ai_models',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=True),
        sa.Column('provider', sa.String(50), nullable=False),
        sa.Column('model_name', sa.String(200), nullable=False),
        sa.Column('display_name', sa.String(200), nullable=False),
        sa.Column('api_key_encrypted', sa.Text(), nullable=True),
        sa.Column('base_url', sa.String(500), nullable=False),
        sa.Column('is_default', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    # Add ai_model_id to agents
    op.add_column('agents', sa.Column('ai_model_id', sa.Integer(), sa.ForeignKey('ai_models.id'), nullable=True))

    # --- Board Permissions table ---
    op.create_table(
        'board_permissions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('board_id', sa.Integer(), sa.ForeignKey('boards.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('permission_level', sa.String(20), nullable=False),
        sa.Column('granted_by_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )

    # --- User avatar ---
    op.add_column('users', sa.Column('avatar_url', sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'avatar_url')
    op.drop_table('board_permissions')
    op.drop_column('agents', 'ai_model_id')
    op.drop_table('ai_models')
    op.drop_index('ix_skills_name', 'skills')
    op.drop_table('agent_skills')
    op.drop_table('skills')
