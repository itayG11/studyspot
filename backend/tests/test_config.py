"""Settings that make the cloud setup a matter of a few variables."""

from app.config import Settings


def settings(**values) -> Settings:
    return Settings(_env_file=None, **{"database_url": "postgresql+psycopg://u@h/db", **values})


def test_one_site_address_sets_both_the_web_app_and_the_api():
    s = settings(site_url="https://studyspot.onrender.com/")
    assert s.frontend_url == "https://studyspot.onrender.com"
    assert s.public_api_url == "https://studyspot.onrender.com/api"
    assert s.allowed_origins() == ["https://studyspot.onrender.com"]
    assert s.auth_cookie_path() == "/api/auth"


def test_render_gives_the_site_address_itself(monkeypatch):
    monkeypatch.setenv("RENDER_EXTERNAL_URL", "https://studyspot-x1.onrender.com")
    s = settings()
    assert s.frontend_url == "https://studyspot-x1.onrender.com"
    assert s.public_api_url == "https://studyspot-x1.onrender.com/api"


def test_without_a_site_address_development_defaults_stay():
    s = settings()
    assert s.public_api_url == "http://localhost:8000"
    assert s.auth_cookie_path() == "/auth"


def test_a_plain_postgres_address_uses_the_psycopg_driver():
    # Hosting providers (Neon, Render) hand out "postgresql://" addresses.
    neon = "postgresql://user:pw@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require"
    assert settings(database_url=neon).database_url == neon.replace("postgresql://", "postgresql+psycopg://", 1)
    assert settings(database_url="postgres://u:p@h/db").database_url == "postgresql+psycopg://u:p@h/db"
    assert settings(database_url="postgresql+psycopg://u@h/db").database_url == "postgresql+psycopg://u@h/db"


def test_a_pasted_address_with_spaces_or_quotes_still_works():
    url = "postgresql://user:pw@ep-x.neon.tech/neondb?sslmode=require"
    expected = url.replace("postgresql://", "postgresql+psycopg://", 1)
    assert settings(database_url=f"  {url}\n").database_url == expected
    assert settings(database_url=f"'{url}'").database_url == expected


def test_a_command_instead_of_an_address_is_refused_clearly_without_the_password():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError) as refused:
        settings(database_url="psql 'postgresql://user:secret-pw@ep-x.neon.tech/neondb'")
    message = str(refused.value)
    assert "DATABASE_URL must start with postgresql://" in message
    assert "secret-pw" not in message
