from datetime import datetime, timezone

from sqlalchemy import String, Boolean, DateTime, Integer, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class InstalledTemplate(Base):
    __tablename__ = "installed_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    template_slug: Mapped[str] = mapped_column(String(100), nullable=False)
    template_type: Mapped[str] = mapped_column(String(20), nullable=False)  # 'agent', 'skill'
    template_name: Mapped[str] = mapped_column(String(200), nullable=False)
    template_version: Mapped[str] = mapped_column(String(20), nullable=False)
    manifest: Mapped[dict] = mapped_column(JSONB, nullable=False)
    local_resource_id: Mapped[int] = mapped_column(Integer, nullable=False)  # agent.id or skill.id
    local_resource_type: Mapped[str] = mapped_column(String(20), nullable=False)  # 'agent' or 'skill'
    installed_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    installed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
