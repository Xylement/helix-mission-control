from datetime import datetime, timezone
import uuid

from sqlalchemy import String, DateTime, Integer, BigInteger, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class Backup(Base):
    __tablename__ = "backups"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[int] = mapped_column(Integer, ForeignKey("organizations.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    backup_type: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")  # auto/manual
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="in_progress")  # completed/failed/in_progress
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
