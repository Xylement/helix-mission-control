from datetime import datetime
from pydantic import BaseModel


class BoardPermissionCreate(BaseModel):
    user_id: int
    permission_level: str  # view | create | manage


class BoardPermissionUpdate(BaseModel):
    permission_level: str


class BoardPermissionOut(BaseModel):
    id: int
    board_id: int
    user_id: int
    user_name: str = ""
    user_email: str = ""
    permission_level: str
    granted_by_user_id: int | None = None
    created_at: datetime

    class Config:
        from_attributes = True
