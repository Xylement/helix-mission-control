from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey, Integer, Text, Boolean, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    parent_goal_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("goals.id", ondelete="CASCADE"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    goal_type: Mapped[str] = mapped_column(String(20), nullable=False, default="objective")  # mission | objective | key_result
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")  # active | completed | paused | cancelled
    owner_type: Mapped[str | None] = mapped_column(String(10), nullable=True)  # user | agent | NULL
    owner_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # polymorphic FK
    target_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    department_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)
    board_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("boards.id", ondelete="SET NULL"), nullable=True, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    parent: Mapped["Goal | None"] = relationship(remote_side="Goal.id", back_populates="children")
    children: Mapped[list["Goal"]] = relationship(back_populates="parent", cascade="all, delete-orphan")
    department: Mapped["Department | None"] = relationship()  # noqa: F821
    board: Mapped["Board | None"] = relationship()  # noqa: F821
