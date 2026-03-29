from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Boolean, ForeignKey, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class WhiteLabelConfig(Base):
    __tablename__ = "white_label_config"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(Integer, ForeignKey("organizations.id"), unique=True, nullable=False)

    product_name: Mapped[str] = mapped_column(String(100), default="HELIX Mission Control")
    product_short_name: Mapped[str] = mapped_column(String(30), default="HELIX")
    company_name: Mapped[str] = mapped_column(String(100), default="HelixNode")
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    favicon_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    accent_color: Mapped[str] = mapped_column(String(7), default="#3b82f6")
    accent_color_secondary: Mapped[str] = mapped_column(String(7), default="#8b5cf6")
    login_title: Mapped[str] = mapped_column(String(200), default="Sign in to Mission Control")
    login_subtitle: Mapped[str | None] = mapped_column(Text, nullable=True)
    footer_text: Mapped[str] = mapped_column(String(200), default="Powered by HelixNode")
    loading_animation_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    loading_animation_text: Mapped[str] = mapped_column(String(30), default="HELIX")
    custom_css: Mapped[str | None] = mapped_column(Text, nullable=True)
    docs_url: Mapped[str | None] = mapped_column(Text, default="https://docs.helixnode.tech")
    support_email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    support_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    marketplace_visible: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
