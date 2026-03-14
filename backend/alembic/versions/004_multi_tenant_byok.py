"""Multi-tenant enforcement + BYOK model settings

- Create GALADO organization and backfill all org_id fields
- Add BYOK columns to organization_settings
- Create token_usage table
- Add model_provider/model_name to agents
- Add token_prefix to service_tokens
- Change name uniqueness to per-org

Revision ID: 004_multi_tenant_byok
Revises: 003_batch_b
Create Date: 2026-03-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '004_multi_tenant_byok'
down_revision: Union[str, None] = '003_batch_b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Create GALADO organization ──
    op.execute("""
        INSERT INTO organizations (name, slug, created_at)
        SELECT 'GALADO', 'galado', NOW()
        WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE slug = 'galado')
    """)

    # ── 2. Backfill org_id on all tables ──
    op.execute("""
        UPDATE users SET org_id = (SELECT id FROM organizations WHERE slug = 'galado')
        WHERE org_id IS NULL
    """)
    op.execute("""
        UPDATE departments SET org_id = (SELECT id FROM organizations WHERE slug = 'galado')
        WHERE org_id IS NULL
    """)
    op.execute("""
        UPDATE agents SET org_id = (SELECT id FROM organizations WHERE slug = 'galado')
        WHERE org_id IS NULL
    """)
    op.execute("""
        UPDATE activity_logs SET org_id = (SELECT id FROM organizations WHERE slug = 'galado')
        WHERE org_id IS NULL
    """)
    op.execute("""
        UPDATE notifications SET org_id = (SELECT id FROM organizations WHERE slug = 'galado')
        WHERE org_id IS NULL
    """)

    # ── 3. Make users.org_id non-nullable ──
    op.alter_column('users', 'org_id', nullable=False)
    op.create_index('ix_users_org_id', 'users', ['org_id'])

    # ── 4. Add BYOK columns to organization_settings ──
    op.add_column('organization_settings',
        sa.Column('model_provider', sa.String(50), nullable=True))
    op.add_column('organization_settings',
        sa.Column('model_name', sa.String(100), nullable=True))
    op.add_column('organization_settings',
        sa.Column('model_api_key_encrypted', sa.Text(), nullable=True))
    op.add_column('organization_settings',
        sa.Column('model_base_url', sa.String(500), nullable=True))
    op.add_column('organization_settings',
        sa.Column('model_display_name', sa.String(100), nullable=True))
    op.add_column('organization_settings',
        sa.Column('model_context_window', sa.Integer(), nullable=True))
    op.add_column('organization_settings',
        sa.Column('model_max_tokens', sa.Integer(), nullable=True))
    op.add_column('organization_settings',
        sa.Column('timezone', sa.String(50), nullable=True))
    op.add_column('organization_settings',
        sa.Column('logo_url', sa.String(500), nullable=True))
    op.add_column('organization_settings',
        sa.Column('max_agents', sa.Integer(), nullable=True))
    op.add_column('organization_settings',
        sa.Column('telegram_bot_token_encrypted', sa.Text(), nullable=True))
    op.add_column('organization_settings',
        sa.Column('telegram_allowed_user_ids', sa.Text(), nullable=True))

    # Backfill: create settings for GALADO org if not exists
    op.execute("""
        INSERT INTO organization_settings (org_id, model_provider, model_name, timezone, created_at, updated_at)
        SELECT id, 'moonshot', 'kimi-k2.5', 'Asia/Kuala_Lumpur', NOW(), NOW()
        FROM organizations WHERE slug = 'galado'
        AND NOT EXISTS (
            SELECT 1 FROM organization_settings os
            WHERE os.org_id = organizations.id
        )
    """)

    # Update existing settings rows with default values
    op.execute("""
        UPDATE organization_settings
        SET model_provider = COALESCE(model_provider, 'moonshot'),
            model_name = COALESCE(model_name, 'kimi-k2.5'),
            timezone = COALESCE(timezone, 'Asia/Kuala_Lumpur')
        WHERE model_provider IS NULL
    """)

    # ── 5. Create token_usage table ──
    op.create_table('token_usage',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('agent_id', sa.Integer(), sa.ForeignKey('agents.id'), nullable=True),
        sa.Column('model_provider', sa.String(50), nullable=False),
        sa.Column('model_name', sa.String(100), nullable=False),
        sa.Column('input_tokens', sa.Integer(), server_default='0', nullable=False),
        sa.Column('output_tokens', sa.Integer(), server_default='0', nullable=False),
        sa.Column('total_tokens', sa.Integer(), server_default='0', nullable=False),
        sa.Column('task_id', sa.Integer(), sa.ForeignKey('tasks.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_token_usage_org_id', 'token_usage', ['org_id'])
    op.create_index('ix_token_usage_agent_id', 'token_usage', ['agent_id'])
    op.create_index('ix_token_usage_created_at', 'token_usage', ['created_at'])

    # ── 6. Add model_provider/model_name to agents ──
    op.add_column('agents',
        sa.Column('model_provider', sa.String(50), nullable=True))
    op.add_column('agents',
        sa.Column('model_name', sa.String(100), nullable=True))

    # ── 7. Add token_prefix to service_tokens ──
    op.add_column('service_tokens',
        sa.Column('token_prefix', sa.String(10), nullable=True))
    op.create_index('ix_service_tokens_token_prefix', 'service_tokens', ['token_prefix'])

    # ── 8. Change name uniqueness from global to per-org ──
    # Users: drop global unique on name, add composite (org_id, name)
    op.drop_index('ix_users_name', 'users')
    op.create_unique_constraint('uq_users_org_name', 'users', ['org_id', 'name'])

    # Agents: drop global unique on name, add composite (org_id, name)
    op.drop_index('ix_agents_name', 'agents')
    op.create_unique_constraint('uq_agents_org_name', 'agents', ['org_id', 'name'])


def downgrade() -> None:
    # Reverse name uniqueness
    op.drop_constraint('uq_agents_org_name', 'agents', type_='unique')
    op.create_index('ix_agents_name', 'agents', ['name'], unique=True)

    op.drop_constraint('uq_users_org_name', 'users', type_='unique')
    op.create_index('ix_users_name', 'users', ['name'], unique=True)

    # Remove token_prefix from service_tokens
    op.drop_index('ix_service_tokens_token_prefix', 'service_tokens')
    op.drop_column('service_tokens', 'token_prefix')

    # Remove model columns from agents
    op.drop_column('agents', 'model_name')
    op.drop_column('agents', 'model_provider')

    # Drop token_usage table
    op.drop_index('ix_token_usage_created_at', 'token_usage')
    op.drop_index('ix_token_usage_agent_id', 'token_usage')
    op.drop_index('ix_token_usage_org_id', 'token_usage')
    op.drop_table('token_usage')

    # Remove BYOK columns from organization_settings
    for col in ('telegram_allowed_user_ids', 'telegram_bot_token_encrypted',
                'max_agents', 'logo_url', 'timezone',
                'model_max_tokens', 'model_context_window', 'model_display_name',
                'model_base_url', 'model_api_key_encrypted',
                'model_name', 'model_provider'):
        op.drop_column('organization_settings', col)

    # Revert users.org_id to nullable
    op.drop_index('ix_users_org_id', 'users')
    op.alter_column('users', 'org_id', nullable=True)
