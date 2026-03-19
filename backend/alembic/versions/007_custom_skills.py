"""Custom agent skills: expand skills/agent_skills, add skill_attachments, add task tags

Revision ID: 007_custom_skills
Revises: 006_license_cache
Create Date: 2026-03-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

revision: str = "007_custom_skills"
down_revision: Union[str, None] = "006_license_cache"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Expand skills table ──
    # Add new columns
    op.add_column('skills', sa.Column('slug', sa.String(100), nullable=True))
    op.add_column('skills', sa.Column('category', sa.String(50), nullable=True))
    op.add_column('skills', sa.Column('tags', ARRAY(sa.Text()), nullable=True))
    op.add_column('skills', sa.Column('content', sa.Text(), server_default='', nullable=False))
    op.add_column('skills', sa.Column('frontmatter', JSONB(), nullable=True))
    op.add_column('skills', sa.Column('activation_mode', sa.String(20), server_default='always', nullable=False))
    op.add_column('skills', sa.Column('activation_boards', ARRAY(sa.Integer()), nullable=True))
    op.add_column('skills', sa.Column('activation_tags', ARRAY(sa.Text()), nullable=True))
    op.add_column('skills', sa.Column('is_system', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('skills', sa.Column('marketplace_template_id', sa.String(100), nullable=True))
    op.add_column('skills', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()))

    # Backfill slug from name for any existing rows
    op.execute("""
        UPDATE skills SET slug = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'))
        WHERE slug IS NULL
    """)
    # Backfill org_id for any NULL rows
    op.execute("""
        UPDATE skills SET org_id = (SELECT id FROM organizations WHERE slug = 'galado')
        WHERE org_id IS NULL
    """)

    # Now make slug NOT NULL and add unique constraint
    op.alter_column('skills', 'slug', nullable=False)
    op.alter_column('skills', 'org_id', nullable=False)
    op.create_unique_constraint('uq_skills_org_slug', 'skills', ['org_id', 'slug'])

    # Rename created_by_user_id -> created_by for consistency
    op.alter_column('skills', 'created_by_user_id', new_column_name='created_by')

    # Drop old columns that are no longer needed
    op.drop_column('skills', 'source_type')
    op.drop_column('skills', 'source_url')
    op.drop_column('skills', 'config')
    op.drop_column('skills', 'installed_at')

    # ── 2. Expand agent_skills table ──
    op.add_column('agent_skills', sa.Column('assigned_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True))
    # Drop old columns
    op.drop_column('agent_skills', 'enabled')
    op.drop_column('agent_skills', 'config_override')
    # Add unique constraint
    op.create_unique_constraint('uq_agent_skills_agent_skill', 'agent_skills', ['agent_id', 'skill_id'])

    # ── 3. Create skill_attachments table ──
    op.create_table(
        'skill_attachments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('skill_id', sa.Integer(), sa.ForeignKey('skills.id', ondelete='CASCADE'), nullable=False),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('original_filename', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('mime_type', sa.String(100), nullable=True),
        sa.Column('storage_path', sa.Text(), nullable=False),
        sa.Column('uploaded_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── 4. Add tags to tasks table ──
    op.add_column('tasks', sa.Column('tags', ARRAY(sa.Text()), server_default='{}', nullable=True))


def downgrade() -> None:
    # Remove tags from tasks
    op.drop_column('tasks', 'tags')

    # Drop skill_attachments
    op.drop_table('skill_attachments')

    # Revert agent_skills
    op.drop_constraint('uq_agent_skills_agent_skill', 'agent_skills', type_='unique')
    op.drop_column('agent_skills', 'assigned_by')
    op.add_column('agent_skills', sa.Column('enabled', sa.Boolean(), server_default='true', nullable=False))
    op.add_column('agent_skills', sa.Column('config_override', JSONB(), nullable=True))

    # Revert skills
    op.drop_constraint('uq_skills_org_slug', 'skills', type_='unique')
    op.add_column('skills', sa.Column('source_type', sa.String(50), server_default='custom', nullable=False))
    op.add_column('skills', sa.Column('source_url', sa.String(500), nullable=True))
    op.add_column('skills', sa.Column('config', JSONB(), nullable=True))
    op.add_column('skills', sa.Column('installed_at', sa.DateTime(timezone=True), nullable=True))
    op.alter_column('skills', 'created_by', new_column_name='created_by_user_id')
    op.drop_column('skills', 'created_at')
    op.drop_column('skills', 'marketplace_template_id')
    op.drop_column('skills', 'is_system')
    op.drop_column('skills', 'activation_tags')
    op.drop_column('skills', 'activation_boards')
    op.drop_column('skills', 'activation_mode')
    op.drop_column('skills', 'frontmatter')
    op.drop_column('skills', 'content')
    op.drop_column('skills', 'tags')
    op.drop_column('skills', 'category')
    op.drop_column('skills', 'slug')
    op.alter_column('skills', 'org_id', nullable=True)
