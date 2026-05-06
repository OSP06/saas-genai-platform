from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional


class ApiConfiguration(BaseModel):
    openaiApiKey: str = ""
    anthropicApiKey: str = ""
    vectorDbUrl: str = ""
    webhookUrl: Optional[str] = None


class ModelConfiguration(BaseModel):
    ragQueryModel: str = "claude-sonnet-4-6"
    agentExecutionModel: str = "claude-sonnet-4-6"
    embeddingModel: str = "all-MiniLM-L6-v2"


class NotificationSettings(BaseModel):
    agentTaskCompletions: bool = True
    documentProcessing: bool = True
    usageAlerts: bool = False
    errorNotifications: bool = True


class PreferenceSettings(BaseModel):
    theme: str = "dark"
    compactMode: bool = False
    showTimestamps: bool = True


class SettingsResponse(BaseModel):
    apiConfiguration: ApiConfiguration
    modelConfiguration: ModelConfiguration
    notifications: NotificationSettings
    preferences: PreferenceSettings


class SettingsUpdateRequest(BaseModel):
    apiConfiguration: Optional[ApiConfiguration] = None
    modelConfiguration: Optional[ModelConfiguration] = None
    notifications: Optional[NotificationSettings] = None
    preferences: Optional[PreferenceSettings] = None


class SettingsUpdateResponse(BaseModel):
    success: bool


class ApiKeyCreateRequest(BaseModel):
    name: str
    permissions: list[str] = ["read"]


class ApiKeyCreateResponse(BaseModel):
    id: UUID
    key: str            # shown only once
    createdAt: datetime
    permissions: list[str]


class ApiKeyDeleteResponse(BaseModel):
    success: bool


class ApiKeySummary(BaseModel):
    id: UUID
    name: str
    keyPreview: str
    permissions: list[str]
    createdAt: datetime
