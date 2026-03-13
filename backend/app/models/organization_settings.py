from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class OrganizationSettings(Base):
    __tablename__ = "organization_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(Integer, ForeignKey("organizations.id"), unique=True)
    moonshot_api_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    openai_api_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    anthropic_api_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    default_gateway_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("gateways.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
