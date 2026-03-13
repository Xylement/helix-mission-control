from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class BoardPermission(Base):
    __tablename__ = "board_permissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    board_id: Mapped[int] = mapped_column(Integer, ForeignKey("boards.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    permission_level: Mapped[str] = mapped_column(String(20))  # view | create | manage
    granted_by_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    board: Mapped["Board"] = relationship()  # noqa: F821
    user: Mapped["User"] = relationship(foreign_keys=[user_id])  # noqa: F821
    granted_by: Mapped["User"] = relationship(foreign_keys=[granted_by_user_id])  # noqa: F821
