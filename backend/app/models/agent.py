from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey, Integer, Text, Boolean, Numeric
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
    monthly_budget_usd: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True, default=None)
    budget_warning_threshold: Mapped[float | None] = mapped_column(Numeric(3, 2), nullable=True, default=0.80)
    budget_paused: Mapped[bool] = mapped_column(Boolean, default=False)
    budget_pause_reason: Mapped[str | None] = mapped_column(String(200), nullable=True, default=None)
    budget_reset_day: Mapped[int | None] = mapped_column(Integer, nullable=True, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    department: Mapped["Department"] = relationship(back_populates="agents")  # noqa: F821
    primary_board: Mapped["Board"] = relationship()  # noqa: F821
