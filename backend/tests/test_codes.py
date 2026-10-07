"""Signed check-in codes cannot be guessed, forged or reused after revocation."""

import pytest

from app.codes import CodeClaim, InvalidCode, make_code, read_code

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


def test_missing_secret_fails_clearly():
    from app.config import Settings

    settings = Settings(database_url="postgresql+psycopg://x@localhost/x", _env_file=None)
    with pytest.raises(RuntimeError, match="CHECKIN_CODE_SECRET"):
        settings.code_secret_bytes()
