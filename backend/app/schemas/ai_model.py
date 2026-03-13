from datetime import datetime
from pydantic import BaseModel


class AIModelCreate(BaseModel):
    provider: str
    model_name: str
    display_name: str
    api_key: str | None = None
    base_url: str
    is_default: bool = False


class AIModelUpdate(BaseModel):
    provider: str | None = None
    model_name: str | None = None
    display_name: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    is_active: bool | None = None


class AIModelOut(BaseModel):
    id: int
    provider: str
    model_name: str
    display_name: str
    base_url: str
    is_default: bool
    is_active: bool
    has_api_key: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
