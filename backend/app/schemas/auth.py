from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    avatar_url: str | None = None
    telegram_notifications: bool = False
    telegram_user_id: str | None = None

    class Config:
        from_attributes = True


class ProfileUpdate(BaseModel):
    name: str | None = None
    telegram_notifications: bool | None = None
    telegram_user_id: str | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str
