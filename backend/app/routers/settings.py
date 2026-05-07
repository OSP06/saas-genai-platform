import hashlib
import secrets
import uuid
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.settings import ApiKey, UserSettings
from app.schemas.settings import (
    ApiKeyCreateRequest,
    ApiKeyCreateResponse,
    ApiKeyDeleteResponse,
    ApiKeySummary,
    SettingsResponse,
    SettingsUpdateRequest,
    SettingsUpdateResponse,
    ApiConfiguration,
    ModelConfiguration,
    NotificationSettings,
    PreferenceSettings,
)
from app.config import get_settings as get_app_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])
logger = structlog.get_logger()
app_settings = get_app_settings()

DEFAULT_USER_ID = "default"

DEFAULT_SETTINGS = {
    "api_config": {
        "openaiApiKey": "",
        "anthropicApiKey": "",
        "vectorDbUrl": "",
        "webhookUrl": None,
    },
    "model_config": {
        "ragQueryModel": "gpt-4o",
        "agentExecutionModel": "gpt-4o",
        "embeddingModel": "all-MiniLM-L6-v2",
    },
    "notifications": {
        "agentTaskCompletions": True,
        "documentProcessing": True,
        "usageAlerts": False,
        "errorNotifications": True,
    },
    "preferences": {
        "theme": "dark",
        "compactMode": False,
        "showTimestamps": True,
    },
}


async def _get_or_create_settings(db: AsyncSession) -> UserSettings:
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == DEFAULT_USER_ID)
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = UserSettings(
            id=uuid.uuid4(),
            user_id=DEFAULT_USER_ID,
            api_config=DEFAULT_SETTINGS["api_config"],
            model_config_=DEFAULT_SETTINGS["model_config"],
            notifications=DEFAULT_SETTINGS["notifications"],
            preferences=DEFAULT_SETTINGS["preferences"],
        )
        db.add(row)
        await db.flush()
    return row


def _mask_key(key: str) -> str:
    if len(key) <= 8:
        return "***"
    return key[:4] + "..." + key[-4:]


@router.get("", response_model=SettingsResponse)
async def get_settings(db: AsyncSession = Depends(get_db)):
    """Return all user settings (API keys are masked)."""
    row = await _get_or_create_settings(db)
    api_cfg = dict(row.api_config or {})
    # Mask sensitive keys
    if api_cfg.get("openaiApiKey"):
        api_cfg["openaiApiKey"] = _mask_key(api_cfg["openaiApiKey"])
    if api_cfg.get("anthropicApiKey"):
        api_cfg["anthropicApiKey"] = _mask_key(api_cfg["anthropicApiKey"])

    return SettingsResponse(
        apiConfiguration=ApiConfiguration(**{**DEFAULT_SETTINGS["api_config"], **api_cfg}),
        modelConfiguration=ModelConfiguration(**{**DEFAULT_SETTINGS["model_config"], **(row.model_config_ or {})}),
        notifications=NotificationSettings(**{**DEFAULT_SETTINGS["notifications"], **(row.notifications or {})}),
        preferences=PreferenceSettings(**{**DEFAULT_SETTINGS["preferences"], **(row.preferences or {})}),
    )


@router.patch("", response_model=SettingsUpdateResponse)
async def update_settings(
    req: SettingsUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Partial update — only provided fields are overwritten."""
    row = await _get_or_create_settings(db)

    if req.apiConfiguration is not None:
        merged = {**DEFAULT_SETTINGS["api_config"], **(row.api_config or {})}
        update_dict = req.apiConfiguration.model_dump(exclude_none=True)
        merged.update(update_dict)
        row.api_config = merged

    if req.modelConfiguration is not None:
        merged = {**DEFAULT_SETTINGS["model_config"], **(row.model_config_ or {})}
        merged.update(req.modelConfiguration.model_dump(exclude_none=True))
        row.model_config_ = merged

    if req.notifications is not None:
        merged = {**DEFAULT_SETTINGS["notifications"], **(row.notifications or {})}
        merged.update(req.notifications.model_dump(exclude_none=True))
        row.notifications = merged

    if req.preferences is not None:
        merged = {**DEFAULT_SETTINGS["preferences"], **(row.preferences or {})}
        merged.update(req.preferences.model_dump(exclude_none=True))
        row.preferences = merged

    row.updated_at = datetime.now(timezone.utc)
    await db.flush()
    logger.info("settings_updated", user_id=DEFAULT_USER_ID)
    return SettingsUpdateResponse(success=True)


@router.post("/api-keys", response_model=ApiKeyCreateResponse)
async def create_api_key(
    req: ApiKeyCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Generate a new API key. The raw key is returned ONCE — store it securely."""
    raw_key = app_settings.API_KEY_PREFIX + secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    key_preview = raw_key[:8] + "..." + raw_key[-4:]

    api_key = ApiKey(
        id=uuid.uuid4(),
        name=req.name,
        key_hash=key_hash,
        key_preview=key_preview,
        permissions=req.permissions,
    )
    db.add(api_key)
    await db.flush()
    logger.info("api_key_created", key_id=str(api_key.id), name=req.name)

    return ApiKeyCreateResponse(
        id=api_key.id,
        key=raw_key,
        createdAt=api_key.created_at,
        permissions=api_key.permissions,
    )


@router.delete("/api-keys/{key_id}", response_model=ApiKeyDeleteResponse)
async def delete_api_key(
    key_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Revoke an API key (soft-delete via revoked_at timestamp)."""
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    key = result.scalar_one_or_none()
    if key is None:
        raise HTTPException(status_code=404, detail=f"API key {key_id} not found")
    key.revoked_at = datetime.now(timezone.utc)
    await db.flush()
    logger.info("api_key_revoked", key_id=str(key_id))
    return ApiKeyDeleteResponse(success=True)


@router.get("/api-keys", response_model=list[ApiKeySummary])
async def list_api_keys(db: AsyncSession = Depends(get_db)):
    """List all active (non-revoked) API keys."""
    result = await db.execute(
        select(ApiKey).where(ApiKey.revoked_at.is_(None)).order_by(ApiKey.created_at.desc())
    )
    keys = result.scalars().all()
    return [
        ApiKeySummary(
            id=k.id,
            name=k.name,
            keyPreview=k.key_preview,
            permissions=k.permissions,
            createdAt=k.created_at,
        )
        for k in keys
    ]
