from pydantic_settings import BaseSettings
from pathlib import Path
import os


class Settings(BaseSettings):
    # Database — Railway auto-injects DATABASE_URL for Postgres; fallback to SQLite
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./docplus_ai.db")

    # Security
    SECRET_KEY: str = os.getenv(
        "SECRET_KEY",
        "change-me-in-production-use-a-long-random-string-at-least-32-chars"
    )

    # Storage — Railway uses /tmp for ephemeral storage (persistent volume recommended)
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "/tmp/uploads")

    # Limits
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "100"))

    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    # Frontend URL for CORS (set to your Vercel URL in Railway environment variables)
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "")

    # LandingAI — can also set via Admin Panel → AI Config
    LANDINGAI_API_KEY: str = os.getenv("LANDINGAI_API_KEY", "")
    LANDINGAI_BASE_URL: str = os.getenv("LANDINGAI_BASE_URL", "production")

    # Admin
    ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "chandra.paidimukkala@aquarient.com")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()

# Ensure upload dir exists (Railway /tmp is always writable)
Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
