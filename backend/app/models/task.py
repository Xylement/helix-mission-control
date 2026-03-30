from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey, Integer, Text, Boolean
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="todo")  # todo | in_progress | review | done
    priority: Mapped[str] = mapped_column(String(20), default="medium")  # low | medium | high | urgent
    board_id: Mapped[int] = mapped_column(Integer, ForeignKey("boards.id"))
    assigned_agent_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("agents.id"), nullable=True)
    created_by_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=False)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(Text), server_default="{}", nullable=True)
    goal_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("goals.id", ondelete="SET NULL"), nullable=True, index=True)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    board: Mapped["Board"] = relationship(back_populates="tasks")  # noqa: F821
    assigned_agent: Mapped["Agent | None"] = relationship()  # noqa: F821
    created_by: Mapped["User"] = relationship()  # noqa: F821
    goal: Mapped["Goal | None"] = relationship()  # noqa: F821
    comments: Mapped[list["Comment"]] = relationship(back_populates="task", order_by="Comment.created_at")  # noqa: F821
