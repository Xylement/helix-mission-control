from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Integer, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("organizations.id"), nullable=True)
    actor_type: Mapped[str] = mapped_column(String(10))  # user | agent | system
    actor_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    action: Mapped[str] = mapped_column(String(100))  # e.g. task.created, comment.added
    entity_type: Mapped[str] = mapped_column(String(50))  # task, comment, agent, etc.
    entity_id: Mapped[int] = mapped_column(Integer)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
