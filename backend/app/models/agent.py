from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    org_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("organizations.id"), nullable=True)
    role_title: Mapped[str] = mapped_column(String(200))
    department_id: Mapped[int] = mapped_column(Integer, ForeignKey("departments.id"))
    primary_board_id: Mapped[int] = mapped_column(Integer, ForeignKey("boards.id"))
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="offline")  # online | offline | busy
    execution_mode: Mapped[str] = mapped_column(String(20), default="manual")  # auto | manual
    ai_model_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("ai_models.id"), nullable=True)
    model_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    marketplace_template_slug: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    department: Mapped["Department"] = relationship(back_populates="agents")  # noqa: F821
    primary_board: Mapped["Board"] = relationship()  # noqa: F821
