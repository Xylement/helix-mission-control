from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey, Integer, Text, Boolean, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Skill(Base):
    __tablename__ = "skills"
    __table_args__ = (
        UniqueConstraint("org_id", "slug", name="uq_skills_org_slug"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), index=True)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    version: Mapped[str] = mapped_column(String(20), default="1.0.0", server_default="1.0.0")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    frontmatter: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    activation_mode: Mapped[str] = mapped_column(String(20), default="always", server_default="always")
    activation_boards: Mapped[list[int] | None] = mapped_column(ARRAY(Integer), nullable=True)
    activation_tags: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    created_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    marketplace_template_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    agent_skills: Mapped[list["AgentSkill"]] = relationship(back_populates="skill", cascade="all, delete-orphan")
    attachments: Mapped[list["SkillAttachment"]] = relationship(back_populates="skill", cascade="all, delete-orphan")
    created_by_user: Mapped["User | None"] = relationship(foreign_keys=[created_by])  # noqa: F821


class AgentSkill(Base):
    __tablename__ = "agent_skills"
    __table_args__ = (
        UniqueConstraint("agent_id", "skill_id", name="uq_agent_skills_agent_skill"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(Integer, ForeignKey("agents.id", ondelete="CASCADE"))
    skill_id: Mapped[int] = mapped_column(Integer, ForeignKey("skills.id", ondelete="CASCADE"))
    assigned_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    agent: Mapped["Agent"] = relationship()  # noqa: F821
    skill: Mapped["Skill"] = relationship(back_populates="agent_skills")


class SkillAttachment(Base):
    __tablename__ = "skill_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    skill_id: Mapped[int] = mapped_column(Integer, ForeignKey("skills.id", ondelete="CASCADE"))
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    uploaded_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    skill: Mapped["Skill"] = relationship(back_populates="attachments")
