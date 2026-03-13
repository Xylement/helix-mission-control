from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey, Integer, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AIModel(Base):
    __tablename__ = "ai_models"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("organizations.id"), nullable=True)
    provider: Mapped[str] = mapped_column(String(50))  # moonshot | openai | anthropic | nvidia | custom
    model_name: Mapped[str] = mapped_column(String(200))
    display_name: Mapped[str] = mapped_column(String(200))
    api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    base_url: Mapped[str] = mapped_column(String(500))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
