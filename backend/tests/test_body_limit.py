"""The cap on request bodies, and 422s that do not send the input back
(test round, 25 Oct; app/body_limit.py)."""

from fastapi.testclient import TestClient

from app.body_limit import DEFAULT_LIMIT
from app.main import app


def test_a_body_over_the_cap_is_refused_before_the_app_reads_it(client):
    response = client.post("/auth/email/verify", content=b"x" * (DEFAULT_LIMIT + 1), headers={"content-type": "application/json"})
    assert (response.status_code, response.json()) == (413, {"detail": "body_too_big"})


def test_a_body_that_streams_past_the_cap_is_cut_off(client):
    def chunks():  # no length declared: counted as it arrives
        for _ in range(5):
            yield b"x" * (DEFAULT_LIMIT // 2)

    response = client.post("/auth/email/verify", content=chunks(), headers={"content-type": "application/json"})
    assert response.status_code == 413


def test_a_photo_gets_room_for_its_own_limit(client):
    # 2.5 MB: over the default cap, under the photo route's room; the route
    # then answers with its own, exact, limit (2 MB), not the cap's 413.
    response = client.post("/me/classes/import-photo", content=b"x" * (2_500_000))
    assert response.status_code != 413


def test_a_normal_body_passes(client):
    assert client.post("/me/email-notices", json={"enabled": False}).status_code == 200


def test_a_validation_error_does_not_send_the_input_back(client):
    secret = "Not-My-Password-" + "x" * 200  # over the 128 limit
    response = TestClient(app).post("/auth/password/login", json={"email": "a@b.example", "password": secret})
    assert response.status_code == 422
    assert secret not in response.text
    assert response.json()["detail"][0]["loc"] == ["body", "password"]
