from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TaskAttachment(Base):
    __tablename__ = "task_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    org_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("organizations.id"), nullable=True)
    filename: Mapped[str] = mapped_column(String(500))
    file_path: Mapped[str] = mapped_column(Text)
    file_size: Mapped[int] = mapped_column(Integer)
    mime_type: Mapped[str] = mapped_column(String(200))
    uploaded_by_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    uploaded_by_agent_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("agents.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
