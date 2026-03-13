from datetime import datetime
from pydantic import BaseModel


class CommentCreate(BaseModel):
    content: str


class CommentOut(BaseModel):
    id: int
    task_id: int
    author_type: str
    author_id: int
    author_name: str | None = None
    content: str
    mentions: dict | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class ActivityOut(BaseModel):
    id: int
    actor_type: str
    actor_id: int | None = None
    action: str
    entity_type: str
    entity_id: int
    details: dict | None = None
    created_at: datetime

    class Config:
        from_attributes = True
