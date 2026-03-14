from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Integer, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ServiceToken(Base):
    __tablename__ = "service_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(Integer, ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    token_prefix: Mapped[str | None] = mapped_column(String(10), nullable=True, index=True)
    permissions: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
