from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Integer, Boolean, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class OnboardingState(Base):
    __tablename__ = "onboarding_state"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("organizations.id"), nullable=True)
    current_step: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    completed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
