"""Wave 14.1: "I'm studying here", a signed link that ends with the stay."""

from datetime import timedelta
from pathlib import Path

import pytest
from conftest import SUNDAY_10AM, code_for, place_named
from fastapi.testclient import TestClient

from app import shares
from app.api.deps import get_session
from app.api.shares import share_key
from app.clock import get_now
from app.config import get_settings
from app.models import User
from app.site import create_site

KEY = share_key(get_settings())


def _check_in(client, place) -> int:
    answer = client.post("/check-ins", json={"code": code_for(place)})
    assert answer.status_code == 201, answer.text
    return answer.json()["id"]


def _share(client, kind, row_id, show_name=False):
    return client.post("/shares", json={"kind": kind, "id": row_id, "show_name": show_name})


def _token(answer) -> str:
    assert answer.status_code == 200, answer.text
    return answer.json()["url"].rsplit("/s/", 1)[1]


@pytest.fixture
def library(braude):
    return place_named(braude, "EF", "ספרייה")


# --- the signature ------------------------------------------------------------------


def test_hebrew_joins_the_letter_and_anything_else_takes_a_hyphen():
    assert (shares.in_place("ספרייה"), shares.in_place("M206")) == ("בספרייה", "ב-M206")


def test_a_token_reads_back_and_a_changed_one_does_not():
    token = shares.make_token(KEY, "c", 42, named=False)
    assert shares.read_token(KEY, token) == shares.Claim("c", 42, False)
    # Turning the name on, or pointing at another stay, breaks the signature.
    assert shares.read_token(KEY, token.replace(".n0.", ".n1.")) is None
    assert shares.read_token(KEY, token.replace("c42", "c43")) is None
    assert shares.read_token(KEY, token.replace("c42", "b42")) is None
    assert shares.read_token(b"another key" * 4, token) is None
    assert shares.read_token(KEY, "c42.n0.short") is None


# --- making a link --------------------------------------------------------------------


def test_a_student_shares_their_check_in_and_a_friend_reads_it(client, library):
    stay = _check_in(client, library)
    answer = _share(client, "check_in", stay)
    assert answer.json()["url"].startswith(get_settings().frontend_url.rstrip("/") + "/s/c")
    client.user = None  # the friend is not signed in
    read = client.get(f"/shares/{_token(answer)}")
    assert read.status_code == 200
    body = read.json()
    assert (body["place_name"], body["building_code"], body["here_now"]) == ("ספרייה", "EF", True)
    assert body["name"] is None  # not chosen
    assert read.headers["cache-control"] == "no-store"
    assert "email" not in body and "user_id" not in body


def test_the_name_is_shown_only_when_chosen(client, library):
    token = _token(_share(client, "check_in", _check_in(client, library), show_name=True))
    client.user = None
    assert client.get(f"/shares/{token}").json()["name"] == "Student"


def test_someone_elses_stay_cannot_be_shared(client, session, braude, library):
    stay = _check_in(client, library)
    other = User(institution_id=braude.id, email="other@braude.example", display_name="Other")
    session.add(other)
    session.flush()
    client.user = other
    assert _share(client, "check_in", stay).status_code == 404


def test_signing_in_is_needed_to_make_a_link(client, library):
    stay = _check_in(client, library)
    client.user = None
    assert _share(client, "check_in", stay).status_code == 401


# --- the link ends by itself ------------------------------------------------------------


def test_the_link_stops_when_the_student_leaves(client, library):
    stay = _check_in(client, library)
    token = _token(_share(client, "check_in", stay))
    assert client.post(f"/check-ins/{stay}/checkout").status_code == 200
    assert client.get(f"/shares/{token}").status_code == 404
    assert client.get(f"/shares/{token}").json()["detail"] == "share_ended"


def test_the_link_stops_when_the_check_in_runs_out(client, library):
    stay = _check_in(client, library)
    token = _token(_share(client, "check_in", stay))
    client.clock.now = SUNDAY_10AM + timedelta(hours=12)
    assert client.get(f"/shares/{token}").status_code == 404


def test_a_booking_link_says_when_and_ends_with_a_cancel(client, braude):
    room = place_named(braude, "EM", "EM107")
    start = SUNDAY_10AM + timedelta(hours=2)
    booked = client.post(
        "/bookings",
        json={"place_id": room.id, "starts_at": start.isoformat(), "ends_at": (start + timedelta(hours=1)).isoformat()},
    )
    assert booked.status_code == 201, booked.text
    booking = booked.json()["id"]
    token = _token(_share(client, "booking", booking))
    body = client.get(f"/shares/{token}").json()
    assert body["here_now"] is False  # in two hours
    assert body["until"].startswith((start + timedelta(hours=1)).isoformat()[:16])
    assert client.post(f"/bookings/{booking}/cancel").status_code == 200
    assert client.get(f"/shares/{token}").status_code == 404


def test_a_forged_link_is_refused_like_an_ended_one(client):
    forged = shares.make_token(b"not the server key" * 3, "c", 1, named=True)
    assert client.get(f"/shares/{forged}").status_code == 404
    assert client.get("/shares/not-a-token").status_code == 422


# --- the preview a chat app shows: /s/<token> on the site ---------------------------------

INDEX = """<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta name="description" content="general" />
    <title>StudySpot</title>
    <meta property="og:title" content="StudySpot: general" />
    <meta property="og:description" content="general description" />
  </head>
  <body><div id="root"></div></body>
</html>"""


@pytest.fixture
def site(tmp_path: Path, session, client) -> TestClient:
    (tmp_path / "index.html").write_text(INDEX, encoding="utf-8")
    edge = create_site(tmp_path)
    edge.site.dependency_overrides[get_session] = lambda: session
    edge.site.dependency_overrides[get_now] = lambda: client.clock.now
    return TestClient(edge)


def test_the_preview_names_the_place_and_the_time(client, site, library):
    token = _token(_share(client, "check_in", _check_in(client, library), show_name=True))
    page = site.get(f"/s/{token}")
    assert page.status_code == 200
    assert '<meta property="og:title" content="Student לומד/ת עכשיו בספרייה"' in page.text
    assert "<title>Student לומד/ת עכשיו בספרייה</title>" in page.text
    assert '<meta name="robots" content="noindex" />' in page.text
    assert page.headers["cache-control"] == "no-store"
    assert '<div id="root"></div>' in page.text  # still the web app


def test_an_ended_link_previews_as_ended(client, site, library):
    stay = _check_in(client, library)
    token = _token(_share(client, "check_in", stay))
    client.post(f"/check-ins/{stay}/checkout")
    assert "הקישור כבר לא פעיל" in site.get(f"/s/{token}").text


def test_a_name_with_html_stays_text(client, site, student, library):
    student.display_name = '"><script>alert(1)</script>'
    token = _token(_share(client, "check_in", _check_in(client, library), show_name=True))
    page = site.get(f"/s/{token}").text
    assert "<script>alert" not in page
    assert "&quot;&gt;&lt;script&gt;" in page
