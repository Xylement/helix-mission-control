from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey, Integer, Text, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Skill(Base):
    __tablename__ = "skills"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("organizations.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_type: Mapped[str] = mapped_column(String(50), default="custom")  # clawhub | github | custom
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    version: Mapped[str] = mapped_column(String(50), default="1.0.0")
    config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    installed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    agent_skills: Mapped[list["AgentSkill"]] = relationship(back_populates="skill", cascade="all, delete-orphan")


class AgentSkill(Base):
    __tablename__ = "agent_skills"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(Integer, ForeignKey("agents.id", ondelete="CASCADE"))
    skill_id: Mapped[int] = mapped_column(Integer, ForeignKey("skills.id", ondelete="CASCADE"))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    config_override: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    agent: Mapped["Agent"] = relationship()  # noqa: F821
    skill: Mapped["Skill"] = relationship(back_populates="agent_skills")
