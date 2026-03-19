"""Add license_cache table

Revision ID: 006_license_cache
Revises: 005_onboarding_state
Create Date: 2026-03-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "006_license_cache"
down_revision: Union[str, None] = "005_onboarding_state"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS license_cache (
            id INTEGER PRIMARY KEY DEFAULT 1,
            license_key_prefix VARCHAR(20),
            plan VARCHAR(50),
            status VARCHAR(50),
            max_agents INTEGER DEFAULT 0,
            max_members INTEGER DEFAULT 0,
            features JSONB DEFAULT '[]',
            trial BOOLEAN DEFAULT false,
            trial_ends_at TIMESTAMP WITH TIME ZONE,
            current_period_end TIMESTAMP WITH TIME ZONE,
            grace_period_ends TIMESTAMP WITH TIME ZONE,
            message TEXT,
            last_validated_at TIMESTAMP WITH TIME ZONE,
            cached_response JSONB
        )
    """)


def downgrade() -> None:
    op.drop_table("license_cache")
