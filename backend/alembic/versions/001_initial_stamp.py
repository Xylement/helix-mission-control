"""initial stamp for existing tables

Revision ID: 001_initial
Revises:
Create Date: 2026-03-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Existing tables already created by Base.metadata.create_all
    # This migration just stamps alembic_version so future migrations work
    pass


def downgrade() -> None:
    pass
