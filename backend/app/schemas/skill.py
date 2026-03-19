from datetime import datetime
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Skill schemas
# ---------------------------------------------------------------------------

class SkillCreate(BaseModel):
    name: str
    slug: str | None = None
    description: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    content: str = ""
    activation_mode: str = "always"
    activation_boards: list[int] | None = None
    activation_tags: list[str] | None = None


class SkillUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    content: str | None = None
    activation_mode: str | None = None
    activation_boards: list[int] | None = None
    activation_tags: list[str] | None = None


class AttachmentOut(BaseModel):
    id: int
    filename: str
    original_filename: str
    description: str | None = None
    file_size: int | None = None
    mime_type: str | None = None
    uploaded_at: datetime | None = None
    download_url: str | None = None

    class Config:
        from_attributes = True


class SkillOut(BaseModel):
    id: int
    name: str
    slug: str
    version: str
    description: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    content: str | None = None
    activation_mode: str = "always"
    activation_boards: list[int] | None = None
    activation_tags: list[str] | None = None
    is_system: bool = False
    created_by: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    agent_count: int = 0
    attachment_count: int = 0
    attachments: list[AttachmentOut] | None = None

    class Config:
        from_attributes = True


class SkillSummary(BaseModel):
    """Lighter version for list views (no content)."""
    id: int
    name: str
    slug: str
    version: str
    description: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    activation_mode: str = "always"
    is_system: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None
    agent_count: int = 0
    attachment_count: int = 0

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Agent-skill assignment schemas
# ---------------------------------------------------------------------------

class AgentSkillOut(BaseModel):
    id: int
    agent_id: int
    skill_id: int
    skill_name: str
    skill_slug: str
    skill_description: str | None = None
    skill_category: str | None = None
    skill_tags: list[str] | None = None
    activation_mode: str = "always"
    attachment_count: int = 0
    assigned_at: datetime | None = None

    class Config:
        from_attributes = True


class AssignSkillsRequest(BaseModel):
    skill_ids: list[int]


class SkillAgentOut(BaseModel):
    """Agent info returned when listing agents assigned to a skill."""
    id: int
    name: str
    role_title: str
    status: str

    class Config:
        from_attributes = True
