from datetime import datetime
from pydantic import BaseModel


class SkillCreate(BaseModel):
    name: str
    description: str | None = None
    source_type: str = "custom"
    source_url: str | None = None
    version: str = "1.0.0"
    config: dict | None = None


class SkillUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    version: str | None = None
    config: dict | None = None


class SkillOut(BaseModel):
    id: int
    name: str
    description: str | None = None
    source_type: str
    source_url: str | None = None
    version: str
    config: dict | None = None
    created_by_user_id: int | None = None
    installed_at: datetime
    updated_at: datetime
    agent_count: int = 0

    class Config:
        from_attributes = True


class AgentSkillOut(BaseModel):
    id: int
    agent_id: int
    skill_id: int
    skill_name: str
    skill_description: str | None = None
    enabled: bool
    config_override: dict | None = None
    assigned_at: datetime

    class Config:
        from_attributes = True


class AssignSkillRequest(BaseModel):
    agent_ids: list[int]
    config_override: dict | None = None
