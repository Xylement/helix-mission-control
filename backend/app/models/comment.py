from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey, Integer, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"))
    author_type: Mapped[str] = mapped_column(String(10))  # user | agent
    author_id: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    mentions: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # {"users": [id], "agents": [id]}
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    task: Mapped["Task"] = relationship(back_populates="comments")  # noqa: F821
