"""Application settings, read from environment variables or the .env file.

Secrets (database passwords) never live in code: they come from .env,
which is git-ignored. See .env.example for the expected keys.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# .env sits at the repository root, one level above backend/.
REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore")

    database_url: str
    test_database_url: str | None = None
    # Signs the check-in codes. SecretStr keeps it out of logs and reprs.
    # Optional here so that tools which never sign codes (migrations, the
    # seed) still run; code_secret_bytes() fails clearly when it is missing.
    checkin_code_secret: SecretStr | None = Field(default=None, min_length=32)

    def code_secret_bytes(self) -> bytes:
        if self.checkin_code_secret is None:
            raise RuntimeError("CHECKIN_CODE_SECRET is not set (see .env.example)")
        return self.checkin_code_secret.get_secret_value().encode()


@lru_cache
def get_settings() -> Settings:
    return Settings()
