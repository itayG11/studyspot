"""Application settings, read from environment variables or the .env file.

Secrets (database passwords) never live in code: they come from .env,
which is git-ignored. See .env.example for the expected keys.
"""

from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# .env sits at the repository root, one level above backend/.
REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    # hide_input_in_errors: a refused value (say, a database address with its
    # password) is never printed in the error, and so never in a log.
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore", hide_input_in_errors=True)

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
    # The demo campus (app/seed/demo.py). Demo sign-in refuses an institution
    # with real sign-in rules, so it can never be pointed at Braude.
    demo_institution: str = "demo"
    # An open campus: a Google or Microsoft account that matches no
    # institution's sign-in rule joins this one as a student, so visitors of
    # the live demo each get a user of their own. Only an institution with no
    # sign-in rules can be open (app/accounts.py), never Braude. Off when unset.
    open_sign_in_institution: str | None = None

    # Sign-in with a one-time code by email (app/email_codes.py). On when a
    # Brevo API key is set; EMAIL_SENDER is the From address, on a domain
    # verified at Brevo. EMAIL_LOGIN_DEV_LOG prints codes to the server log
    # instead, for development only: it is refused on a deployed site.
    brevo_api_key: SecretStr | None = None
    email_sender: str | None = None
    email_login_dev_log: bool = False

    # Where the API and the web app live; used for redirect URLs and CORS.
    public_api_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:5173"
    # In production both live at one address (app/site.py), the API under
    # /api. Setting that address sets both. Render provides it on its own,
    # as RENDER_EXTERNAL_URL.
    site_url: str | None = Field(default=None, validation_alias=AliasChoices("SITE_URL", "RENDER_EXTERNAL_URL", "site_url"))
    # Comma-separated extra origins allowed to call the API with cookies.
    cors_origins: str = ""
    # How many proxies of our own stand between the visitor and the server
    # (they add to X-Forwarded-For). 0 in development: the header is then
    # ignored. Read by the rate limits only (app/ratelimit.py).
    trusted_proxy_hops: int = Field(default=0, ge=0, le=5)
    # Secure cookies need HTTPS; browsers also accept them on localhost.
    cookie_secure: bool = True

    @field_validator("database_url")
    @classmethod
    def _psycopg_driver(cls, url: str) -> str:
        """Hosting providers hand out postgresql:// (or postgres://) addresses;
        SQLAlchemy needs to be told the driver this project installs. A value
        pasted with spaces or quotes around it is cleaned first."""
        url = url.strip().strip("'\"").strip()
        for plain in ("postgresql://", "postgres://"):
            if url.startswith(plain):
                url = "postgresql+psycopg://" + url[len(plain) :]
        if not url.startswith("postgresql+psycopg://"):
            # For example a whole `psql '...'` command copied instead of the address.
            raise ValueError("DATABASE_URL must start with postgresql:// (copy the connection string, not a command)")
        return url

    @model_validator(mode="after")
    def _one_site_address(self) -> "Settings":
        if self.site_url:
            site = self.site_url.rstrip("/")
            self.frontend_url = site
            self.public_api_url = f"{site}/api"
        return self

    @field_validator("brevo_api_key", "email_sender", mode="before")
    @classmethod
    def _blank_is_unset(cls, value):
        """BREVO_API_KEY= copied empty from .env.example means "not set"."""
        return None if isinstance(value, str) and not value.strip() else value

    @model_validator(mode="after")
    def _email_sign_in(self) -> "Settings":
        if self.email_login_dev_log and self.site_url:
            raise ValueError("EMAIL_LOGIN_DEV_LOG would print sign-in codes to a deployed site's log")
        if self.brevo_api_key is not None and not self.email_sender:
            raise ValueError("BREVO_API_KEY needs EMAIL_SENDER, the address the codes are sent from")
        return self

    def email_login_enabled(self) -> bool:
        return self.brevo_api_key is not None or self.email_login_dev_log

    def allowed_origins(self) -> list[str]:
        extra = [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]
        return [self.frontend_url.rstrip("/"), *extra]

    def auth_cookie_path(self) -> str:
        """The sign-in cookies go only to the /auth endpoints, wherever the API
        lives: "/auth" on its own server, "/api/auth" next to the web app."""
        return urlparse(self.public_api_url).path.rstrip("/") + "/auth"

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
