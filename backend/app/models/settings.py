import uuid
from datetime import datetime, timezone
from sqlalchemy import Text, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    key_hash: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    key_preview: Mapped[str] = mapped_column(Text, nullable=False)
    permissions: Mapped[list] = mapped_column(JSONB, default=lambda: ["read"], nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class UserSettings(Base):
    __tablename__ = "user_settings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    api_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    model_config_: Mapped[dict] = mapped_column(
        "model_config", JSONB, default=dict, nullable=False
    )
    notifications: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    preferences: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
