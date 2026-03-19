from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ─── Requests ───

class PluginInstallRequest(BaseModel):
    template_slug: str


class PluginSettingsUpdate(BaseModel):
    settings: Optional[dict] = None
    credentials: Optional[dict] = None


class ExecuteCapabilityRequest(BaseModel):
    capability_id: str
    parameters: Optional[dict] = None
    agent_id: Optional[int] = None


class AgentPluginAssign(BaseModel):
    plugin_id: int
    capabilities: Optional[List[str]] = None


# ─── Responses ───

class PluginCapabilityResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    method: Optional[str] = None
    parameters: Optional[list] = None


class PluginSettingDefinition(BaseModel):
    key: str
    label: str
    type: str = "string"
    required: bool = False
    description: Optional[str] = None
    default: Optional[str] = None


class InstalledPluginResponse(BaseModel):
    id: int
    plugin_slug: str
    name: str
    emoji: Optional[str] = "🔌"
    description: Optional[str] = None
    plugin_type: str
    is_active: bool
    is_configured: bool
    marketplace_template_slug: Optional[str] = None
    installed_by: Optional[int] = None
    installed_at: datetime
    last_used_at: Optional[datetime] = None
    capabilities: List[PluginCapabilityResponse] = []
    setting_definitions: List[PluginSettingDefinition] = []
    masked_credentials: Optional[dict] = None
    settings: Optional[dict] = None
    connected_agent_count: int = 0


class AgentPluginResponse(BaseModel):
    id: int
    agent_id: int
    plugin_id: int
    plugin_name: str
    plugin_emoji: Optional[str] = "🔌"
    plugin_slug: str
    is_configured: bool
    capabilities: Optional[List[str]] = None
    available_capabilities: List[PluginCapabilityResponse] = []


class AgentCapabilityResponse(BaseModel):
    plugin_id: int
    plugin_name: str
    plugin_emoji: Optional[str] = "🔌"
    capability_id: str
    capability_name: str
    description: Optional[str] = None
    method: Optional[str] = None


class PluginExecutionResponse(BaseModel):
    id: int
    plugin_id: Optional[int] = None
    agent_id: Optional[int] = None
    capability_id: str
    capability_name: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    duration_ms: Optional[int] = None
    executed_at: datetime
    request_data: Optional[dict] = None
    response_summary: Optional[dict] = None


class TestConnectionResult(BaseModel):
    success: bool
    message: str
    duration_ms: int = 0
