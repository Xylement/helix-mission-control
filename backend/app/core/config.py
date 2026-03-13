from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://helix:helix_secret_2024@localhost:5432/helix_mc"
    REDIS_URL: str = "redis://localhost:6379/0"
    JWT_SECRET: str = "helix_jwt_secret_change_me_in_production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440  # 24 hours
    ENVIRONMENT: str = "development"
    OPENCLAW_GATEWAY_URL: str = "ws://172.17.0.1:18789"
    OPENCLAW_GATEWAY_TOKEN: str = "ee066700d4d66994447714edc63976514825f316ad9c161c"

    class Config:
        env_file = ".env"


settings = Settings()
