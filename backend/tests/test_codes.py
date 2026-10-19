"""Signed check-in codes cannot be guessed, forged or reused after revocation."""

from datetime import UTC, datetime, timedelta

import pytest

from app.codes import (
    CodeClaim,
    InvalidCode,
    is_fresh,
    make_code,
    make_screen_code,
    read_code,
    seconds_left,
    window_at,
)

SECRET = b"test-secret-that-is-long-enough-1234567890"
OTHER_SECRET = b"another-secret-that-is-long-enough-12345678"


def test_a_valid_code_is_read_back():
    code = make_code(42, 3, SECRET)
    assert code.startswith("p42.v3.")
    assert read_code(code, SECRET) == CodeClaim(place_id=42, version=3)


def test_a_code_signed_with_another_secret_is_rejected():
    with pytest.raises(InvalidCode):
        read_code(make_code(42, 1, OTHER_SECRET), SECRET)


def test_changing_the_place_breaks_the_signature():
    signature = make_code(42, 1, SECRET).split(".")[2]
    with pytest.raises(InvalidCode):
        read_code(f"p43.v1.{signature}", SECRET)


def test_changing_the_version_breaks_the_signature():
    signature = make_code(42, 1, SECRET).split(".")[2]
    with pytest.raises(InvalidCode):
        read_code(f"p42.v2.{signature}", SECRET)


@pytest.mark.parametrize(
    "garbage",
    ["", "hello", "p42.v1", "p42.v1.", "px.v1.abc", "p42.v1.!!!", "p0.v1." + "A" * 43, " p42.v1.x"],
)
def test_malformed_codes_are_rejected(garbage):
    with pytest.raises(InvalidCode):
        read_code(garbage, SECRET)


def test_secret_must_be_long():
    with pytest.raises(ValueError):
        make_code(1, 1, b"short")


def test_missing_secret_fails_clearly(monkeypatch):
    from app.config import Settings

    # Not set anywhere, also where CI sets it for the other tests.
    monkeypatch.delenv("CHECKIN_CODE_SECRET", raising=False)
    settings = Settings(database_url="postgresql+psycopg://x@localhost/x", _env_file=None)
    with pytest.raises(RuntimeError, match="CHECKIN_CODE_SECRET"):
        settings.code_secret_bytes()


# Screen codes (wave 13): a new code every minute, shown on a screen by the door.

NOON = datetime(2026, 10, 20, 12, 0, 30, tzinfo=UTC)


def test_a_screen_code_is_read_back_with_its_minute():
    window = window_at(NOON)
    code = make_screen_code(42, 3, window, SECRET)
    assert code.startswith(f"p42.v3.w{window}.")
    assert read_code(code, SECRET) == CodeClaim(place_id=42, version=3, window=window)


def test_a_printed_code_has_no_minute():
    assert read_code(make_code(42, 3, SECRET), SECRET).window is None


def test_the_window_is_the_minute_since_1970():
    assert window_at(datetime(1970, 1, 1, 0, 1, 59, tzinfo=UTC)) == 1
    assert window_at(NOON + timedelta(seconds=29)) == window_at(NOON)
    assert window_at(NOON + timedelta(seconds=30)) == window_at(NOON) + 1


def test_seconds_left_counts_to_the_next_minute():
    assert seconds_left(NOON) == 30
    assert seconds_left(NOON.replace(second=0, microsecond=0)) == 60


@pytest.mark.parametrize(("minutes_ago", "fresh"), [(0, True), (1, True), (2, False), (60, False), (-1, False)])
def test_only_this_minute_and_the_last_one_are_fresh(minutes_ago, fresh):
    assert is_fresh(window_at(NOON) - minutes_ago, NOON) is fresh


def test_changing_the_minute_breaks_the_signature():
    window = window_at(NOON)
    signature = make_screen_code(42, 1, window, SECRET).split(".")[3]
    with pytest.raises(InvalidCode):
        read_code(f"p42.v1.w{window + 1}.{signature}", SECRET)


def test_a_printed_signature_does_not_make_a_screen_code():
    # Different message prefixes, so one kind of code cannot become the other.
    printed = make_code(42, 1, SECRET).split(".")[2]
    with pytest.raises(InvalidCode):
        read_code(f"p42.v1.w{window_at(NOON)}.{printed}", SECRET)


def test_a_screen_code_fits_the_request_limit():
    assert len(make_screen_code(9_999_999_999, 999_999, window_at(NOON), SECRET)) <= 80
