"""Widen license_key_prefix to store full key for DB-based license persistence

Revision ID: 011_widen_license_key_prefix
Revises: 010_plugin_tables
Create Date: 2026-03-19

"""
from typing import Sequence, Union

from alembic import op

revision: str = "011_widen_license_key_prefix"
down_revision: Union[str, None] = "010_plugin_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE license_cache
        ALTER COLUMN license_key_prefix TYPE VARCHAR(30)
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE license_cache
        ALTER COLUMN license_key_prefix TYPE VARCHAR(20)
    """)
