from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# --- Request schemas ---

class InstallRequest(BaseModel):
    template_slug: str
    customizations: Optional[dict] = None  # { "agent_name": "Custom Name", "department_id": 123, "board_id": 456 }


class UninstallRequest(BaseModel):
    installed_template_id: int


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    title: Optional[str] = Field(None, max_length=200)
    body: Optional[str] = None


# --- Response schemas (from registry API) ---

class MarketplaceAuthor(BaseModel):
    id: str
    username: str
    display_name: str
    avatar_url: Optional[str] = None
    is_verified: bool = False
    is_official: bool = False


class MarketplaceTemplate(BaseModel):
    id: str
    slug: str
    type: str  # 'agent', 'skill', 'workflow', 'plugin', 'department_pack'
    name: str
    emoji: Optional[str] = None
    version: str
    author: MarketplaceAuthor
    description: str
    long_description: Optional[str] = None
    category_slug: str
    category_name: str
    tags: List[str] = []
    icon_url: Optional[str] = None
    screenshots: List[str] = []
    is_official: bool = False
    is_featured: bool = False
    install_count: int = 0
    rating_avg: float = 0.0
    rating_count: int = 0
    min_helix_version: str = "1.0.0"
    min_plan: str = "starter"
    published_at: Optional[datetime] = None


class MarketplaceCategory(BaseModel):
    id: str
    slug: str
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    template_count: int = 0


class MarketplaceReview(BaseModel):
    id: str
    reviewer_name: Optional[str] = None
    rating: int
    title: Optional[str] = None
    body: Optional[str] = None
    helpful_count: int = 0
    created_at: datetime


class PaginatedResponse(BaseModel):
    items: List[dict]
    total: int
    page: int
    page_size: int
    total_pages: int


# --- Installed template tracking (local DB) ---

class InstalledTemplateSchema(BaseModel):
    id: int
    org_id: int
    template_slug: str
    template_type: str
    template_name: str
    template_version: str
    local_resource_id: int
    local_resource_type: str
    installed_by: Optional[int] = None
    installed_at: datetime
    is_active: bool = True

    class Config:
        from_attributes = True


# --- Pre-install check response ---

class PreInstallCheckResponse(BaseModel):
    can_install: bool
    agent_name_conflict: bool = False
    suggested_name: str = ""
    department_exists: bool = False
    department_name: str = ""
    board_exists: bool = False
    board_name: str = ""
    plan_limit_ok: bool = True
    current_installs: int = 0
    max_installs: int = 0
    already_installed: bool = False
    reason: Optional[str] = None
