from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Integer, Boolean, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("organizations.id"), nullable=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    type: Mapped[str] = mapped_column(String(50))  # task_assigned | task_completed | approval_needed | agent_error | mention | task_review
    title: Mapped[str] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(String(1000))
    target_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # task | agent | null
    target_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    telegram_sent: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        Index("ix_notifications_user_read_created", "user_id", "read", "created_at"),
    )
