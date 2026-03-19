"""Add onboarding_state table, dept emoji/sort_order, board sort_order

Revision ID: 005_onboarding_state
Revises: 004_multi_tenant_byok
Create Date: 2026-03-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "005_onboarding_state"
down_revision: Union[str, None] = "004_multi_tenant_byok"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use raw SQL with IF NOT EXISTS to handle cases where create_all already ran
    op.execute("""
        CREATE TABLE IF NOT EXISTS onboarding_state (
            id SERIAL PRIMARY KEY,
            org_id INTEGER REFERENCES organizations(id),
            current_step INTEGER NOT NULL DEFAULT 1,
            completed BOOLEAN NOT NULL DEFAULT FALSE,
            data JSON,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
    """)

    # Add columns only if they don't already exist
    op.execute("ALTER TABLE departments ADD COLUMN IF NOT EXISTS emoji VARCHAR(10)")
    op.execute("ALTER TABLE departments ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0")
    op.execute("ALTER TABLE boards ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0")


def downgrade() -> None:
    op.drop_column("boards", "sort_order")
    op.drop_column("departments", "sort_order")
    op.drop_column("departments", "emoji")
    op.drop_table("onboarding_state")
