from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Integer, Boolean, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class OrganizationSettings(Base):
    __tablename__ = "organization_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(Integer, ForeignKey("organizations.id"), unique=True)

    # Legacy provider-specific keys (kept for backward compat)
    moonshot_api_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    openai_api_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    anthropic_api_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    default_gateway_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("gateways.id"), nullable=True)

    # BYOK model config
    model_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    model_api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_base_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    model_display_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    model_context_window: Mapped[int | None] = mapped_column(Integer, nullable=True)
    model_max_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # General settings
    timezone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    max_agents: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Telegram config
    telegram_bot_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    telegram_allowed_user_ids: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Backup settings
    backup_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    backup_schedule: Mapped[str | None] = mapped_column(String(20), nullable=True, default="daily")
    backup_time: Mapped[str | None] = mapped_column(String(10), nullable=True, default="02:00")
    backup_day: Mapped[str | None] = mapped_column(String(20), nullable=True, default="monday")
    backup_retention_days: Mapped[int | None] = mapped_column(Integer, nullable=True, default=7)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
