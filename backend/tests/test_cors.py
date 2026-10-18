"""In development the site (Vite) and the API are on different ports, so the
browser asks the API first (a CORS preflight) before PATCH and DELETE."""

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app


def test_the_setup_tab_may_patch_and_delete_from_the_site():
    origin = get_settings().frontend_url
    client = TestClient(app)
    for method in ("PATCH", "DELETE"):
        response = client.options(
            "/admin/institutions/demo",
            headers={"Origin": origin, "Access-Control-Request-Method": method},
        )
        assert response.status_code == 200
        assert method in response.headers["access-control-allow-methods"]


def test_another_site_is_still_not_let_in():
    response = TestClient(app).options(
        "/admin/institutions/demo",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "DELETE"},
    )
    assert "access-control-allow-origin" not in response.headers
