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

    # Signs access tokens and the short-lived sign-in cookie.
    jwt_secret: SecretStr | None = Field(default=None, min_length=32)

    # Sign-in providers. A provider without a client id is simply switched off.
    microsoft_client_id: str | None = None
    microsoft_client_secret: SecretStr | None = None
    google_client_id: str | None = None
    google_client_secret: SecretStr | None = None

    # Demo sign-in: two fixed users (a student and an institution admin) with
    # no Microsoft or Google account. For development and the live demo only;
    # when off, the endpoint answers 404 as if it did not exist.
    demo_login_enabled: bool = False
    demo_institution: str = "braude"

    # Where the API and the web app live; used for redirect URLs and CORS.
    public_api_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:5173"
    # Comma-separated extra origins allowed to call the API with cookies.
    cors_origins: str = ""
    # Secure cookies need HTTPS; browsers also accept them on localhost.
    cookie_secure: bool = True

    def allowed_origins(self) -> list[str]:
        extra = [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]
        return [self.frontend_url.rstrip("/"), *extra]

    def jwt_secret_bytes(self) -> bytes:
        if self.jwt_secret is None:
            raise RuntimeError("JWT_SECRET is not set (see .env.example)")
        return self.jwt_secret.get_secret_value().encode()

    def code_secret_bytes(self) -> bytes:
        if self.checkin_code_secret is None:
            raise RuntimeError("CHECKIN_CODE_SECRET is not set (see .env.example)")
        return self.checkin_code_secret.get_secret_value().encode()


@lru_cache
def get_settings() -> Settings:
    return Settings()
