from datetime import datetime, timezone
from typing import Optional, List

from sqlalchemy import String, DateTime, ForeignKey, Integer, Text, Boolean, LargeBinary, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class InstalledPlugin(Base):
    """A plugin installed in this HELIX instance."""
    __tablename__ = "installed_plugins"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    plugin_slug: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    emoji: Mapped[str | None] = mapped_column(String(10), default="🔌")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    plugin_type: Mapped[str] = mapped_column(String(30), default="api_connector")
    manifest: Mapped[dict] = mapped_column(JSONB, nullable=False)
    credentials_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    settings: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    is_configured: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    marketplace_template_slug: Mapped[str | None] = mapped_column(String(100), nullable=True)
    installed_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    installed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    agent_plugins: Mapped[List["AgentPlugin"]] = relationship(
        back_populates="plugin", cascade="all, delete-orphan"
    )
    executions: Mapped[List["PluginExecution"]] = relationship(
        back_populates="plugin", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("org_id", "plugin_slug", name="uq_org_plugin_slug"),
    )


class AgentPlugin(Base):
    """Links an agent to a plugin with specific capability access."""
    __tablename__ = "agent_plugins"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(Integer, ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    plugin_id: Mapped[int] = mapped_column(Integer, ForeignKey("installed_plugins.id", ondelete="CASCADE"), nullable=False)
    capabilities: Mapped[list | None] = mapped_column(JSONB, default=[])

    plugin: Mapped["InstalledPlugin"] = relationship(back_populates="agent_plugins")

    __table_args__ = (
        UniqueConstraint("agent_id", "plugin_id", name="uq_agent_plugin"),
    )


class PluginExecution(Base):
    """Audit log of plugin capability executions."""
    __tablename__ = "plugin_executions"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    plugin_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("installed_plugins.id", ondelete="SET NULL"), nullable=True)
    agent_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("agents.id", ondelete="SET NULL"), nullable=True)
    capability_id: Mapped[str] = mapped_column(String(100), nullable=False)
    capability_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    request_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    response_summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    executed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    plugin: Mapped[Optional["InstalledPlugin"]] = relationship(back_populates="executions")
