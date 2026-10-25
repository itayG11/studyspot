"""Reading a timetable from a photo, with Claude: only a preview, checked
like anything a person types, and no call to the real service in tests
(the reader is replaced by a fake)."""

import anthropic
import httpx2
import pytest

from app import timetable_photo
from app.api.classes import get_photo_reader
from app.config import Settings
from app.main import app
from app.ratelimit import LIMITERS
from app.timetable_import import ImportRefused

PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 100
JPEG = b"\xff\xd8\xff\xe0" + b"\0" * 100
WEBP = b"RIFF\0\0\0\0WEBPVP8 " + b"\0" * 100


class Building:
    def __init__(self, code, name=None):
        self.code, self.name = code, name


CAMPUS = [Building("M", "בניין מכטרוניקה"), Building("L")]


def answer(*classes):
    return {"classes": [
        {"day": day, "starts": s, "ends": e, "building": place, "course": course}
        for day, s, e, place, course in classes
    ]}


def reader(result):
    seen, known = [], []

    def ask(image: bytes, media_type: str, buildings: str):
        seen.append(media_type)
        known.append(buildings)
        if isinstance(result, Exception):
            raise result
        return result

    ask.seen, ask.known = seen, known
    return ask


def test_the_image_kind_is_read_from_its_bytes_not_its_name():
    assert timetable_photo.media_type(PNG) == "image/png"
    assert timetable_photo.media_type(JPEG) == "image/jpeg"
    assert timetable_photo.media_type(WEBP) == "image/webp"
    with pytest.raises(ImportRefused, match="import_not_image"):
        timetable_photo.media_type(b"PK\x03\x04 a zip")
    with pytest.raises(ImportRefused, match="import_too_big"):
        timetable_photo.media_type(PNG + b"\0" * timetable_photo.MAX_BYTES)


def test_classes_come_back_as_the_same_preview_as_the_file():
    ask = reader(answer(
        ("ראשון", "08:30", "10:30", "M", "מבני נתונים, תרגיל"),
        ("שלישי", "14:50", "16:50", "l", "ארכיטקטורה, הרצאה"),
        ("חמישי", "10:30", "12:20", "אולם ספורט", "אורח חיים בריא"),
    ))
    rows = timetable_photo.read_photo(PNG, CAMPUS, ask)
    assert ask.seen == ["image/png"]
    assert [(r.weekday, r.starts, r.ends, r.building_code, r.building_text, r.title) for r in rows] == [
        (6, "08:30", "10:30", "M", "M", "מבני נתונים, תרגיל"),
        (1, "14:50", "16:50", "L", "l", "ארכיטקטורה, הרצאה"),
        (3, "10:30", "12:20", None, "אולם ספורט", "אורח חיים בריא"),
    ]


def test_the_campus_buildings_are_told_to_the_model_and_a_room_is_not_a_building():
    # The Braude export writes "219 M נגישות M": a room, then the building.
    ask = reader(answer(("ראשון", "08:30", "10:30", "219 M", None), ("שני", "10:30", "12:20", "317", None)))
    rows = timetable_photo.read_photo(PNG, CAMPUS, ask)
    assert [(r.building_code, r.building_text) for r in rows] == [("M", "219 M"), (None, "317")]
    # Codes only: a name is written by the institution's admin, and words
    # in the prompt could steer the model; names are matched here instead.
    assert ask.known[0] == "M, L"


def test_the_export_writes_the_building_twice_or_after_accessibility():
    rows = timetable_photo.read_photo(PNG, CAMPUS, reader(answer(
        ("ראשון", "08:30", "10:30", "702 L L", None),
        ("שני", "08:30", "10:30", "219 M נגישות M", None),
    )))
    assert [r.building_code for r in rows] == ["L", "M"]  # Sunday first


def test_a_single_word_matches_a_code_only_never_a_name():
    # A one-word building name must not win over the code beside it.
    campus = [Building("M"), Building("K", "כהן")]
    [row] = timetable_photo.read_photo(PNG, campus, reader(answer(("ראשון", "08:30", "10:30", "219 M כהן", None))))
    assert row.building_code == "M"


def test_a_campus_with_no_buildings_says_so_in_the_prompt():
    client = FakeClient(Response('{"classes": []}'))
    timetable_photo.claude_reader("k6", client)(PNG, "image/png", "")
    assert "none listed" in client.messages.sent["messages"][0]["content"][1]["text"]


def test_a_building_by_its_full_name_is_found():
    [row] = timetable_photo.read_photo(PNG, CAMPUS, reader(answer(("שני", "09:00", "10:00", "בניין  מכטרוניקה", None))))
    assert row.building_code == "M"


def test_what_the_model_says_is_checked_like_anything_typed():
    # A bad row is left out, not trusted: bad day, bad times, the wrong way round.
    rows = timetable_photo.read_photo(PNG, CAMPUS, reader(answer(
        ("יום ראשון", "08:30", "10:30", "M", "x"),  # "יום" before the name is fine
        ("monday", "08:30", "10:30", "M", "x"),
        ("שני", "25:00", "26:00", "M", "x"),
        ("שני", "12:00", "11:00", "M", "x"),
        ("שני", "8:30", "10:30", "M", "a\u202eb" + "c" * 100),
        ("שני", "08:30", "10:30", "x" * 100, None),
    )))
    assert [(r.weekday, r.starts) for r in rows] == [(6, "08:30"), (0, "08:30"), (0, "08:30")]
    assert rows[1].title == "ab" + "c" * 58  # plain text, cut to 60
    assert len(rows[2].building_text) == 40


@pytest.mark.parametrize("bad", [{"classes": "nope"}, {"other": []}, "text", None])
def test_an_answer_of_the_wrong_shape_is_refused(bad):
    with pytest.raises(ImportRefused, match="import_photo_unreadable"):
        timetable_photo.read_photo(PNG, CAMPUS, reader(bad))


def test_no_class_found_and_too_many_are_refused():
    with pytest.raises(ImportRefused, match="import_empty"):
        timetable_photo.read_photo(PNG, CAMPUS, reader(answer()))
    many = [("ראשון", f"{8 + n // 4:02d}:{n % 4 * 15:02d}", f"{8 + n // 4:02d}:{n % 4 * 15 + 10:02d}", "M", None) for n in range(41)]
    with pytest.raises(ImportRefused, match="import_too_many"):
        timetable_photo.read_photo(PNG, CAMPUS, reader(answer(*many)))


# --- The endpoint ---------------------------------------------------------------


@pytest.fixture
def fresh_limits():
    for name, window in LIMITERS.items():
        if name.startswith("timetable-photo"):
            window.reset()


@pytest.fixture
def with_reader(fresh_limits):
    def use(result):
        ask = reader(result)
        app.dependency_overrides[get_photo_reader] = lambda: ask
        return ask

    yield use
    app.dependency_overrides.pop(get_photo_reader, None)


def post(client, body=PNG):
    return client.post("/me/classes/import-photo", content=body, headers={"Content-Type": "application/octet-stream"})


def test_the_endpoint_returns_a_preview_and_saves_nothing(client, with_reader):
    with_reader(answer(("ראשון", "08:30", "10:30", "M", "מבני נתונים")))
    response = post(client)
    assert response.status_code == 200, response.json()
    assert response.json() == [{
        "weekday": 6, "starts": "08:30", "ends": "10:30", "building_code": "M", "building_text": "M",
        "title": "מבני נתונים",
    }]
    assert client.get("/me/classes").json() == []


def test_without_a_key_there_is_no_photo_import(client, fresh_limits):
    app.dependency_overrides[get_photo_reader] = lambda: None
    try:
        assert client.get("/me/classes/import-options").json() == {"photo": False}
        assert post(client).status_code == 404
    finally:
        app.dependency_overrides.pop(get_photo_reader, None)


def test_with_a_key_it_is_offered(client, with_reader):
    with_reader(answer())
    assert client.get("/me/classes/import-options").json() == {"photo": True}


def test_signed_out_is_refused(client, with_reader):
    with_reader(answer())
    client.user = None
    assert post(client).status_code == 401


def test_not_an_image_is_refused_before_any_call(client, with_reader):
    ask = with_reader(answer(("ראשון", "08:30", "10:30", "M", None)))
    assert (post(client, b"PK\x03\x04zip").status_code, ask.seen) == (422, [])


def test_the_service_down_says_so(client, with_reader):
    with_reader(timetable_photo.PhotoUnavailable())
    response = post(client)
    assert (response.status_code, response.json()["detail"]) == (503, "import_photo_unavailable")


def test_one_photo_a_minute_per_person(client, with_reader):
    with_reader(answer(("ראשון", "08:30", "10:30", "M", None)))
    assert post(client).status_code == 200
    assert post(client).status_code == 429


# --- The real reader, around a fake client: what each answer becomes -------------

class FakeMessages:
    def __init__(self, outcome):
        self.outcome, self.sent = outcome, None

    def create(self, **request):
        self.sent = request
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


class FakeClient:
    def __init__(self, outcome):
        self.messages = FakeMessages(outcome)


class Response:
    def __init__(self, text, stop="end_turn"):
        self.stop_reason = stop
        self.content = [type("Thinking", (), {"type": "thinking"})(), type("Text", (), {"type": "text", "text": text})()]


def status_error(cls, code):
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    return cls("x", response=httpx2.Response(code, request=request), body=None)


def test_the_request_is_one_image_held_to_the_schema():
    client = FakeClient(Response('{"classes": []}'))
    assert timetable_photo.claude_reader("k1", client)(PNG, "image/png", "M, L") == {"classes": []}
    sent = client.messages.sent
    assert sent["model"] == "claude-haiku-5-5"
    assert sent["output_config"]["format"] == {"type": "json_schema", "schema": timetable_photo.SCHEMA}
    image, text = sent["messages"][0]["content"]
    assert (image["type"], image["source"]["media_type"]) == ("image", "image/png")
    assert "M, L" in text["text"]  # the campus's buildings, to pick from


@pytest.mark.parametrize("stop", ["max_tokens", "refusal"])
def test_an_answer_cut_off_or_declined_is_unreadable(stop):
    with pytest.raises(ImportRefused, match="import_photo_unreadable"):
        timetable_photo.claude_reader("k2", FakeClient(Response("{}", stop)))(PNG, "image/png", "")


def test_an_image_the_api_refuses_is_unreadable():
    error = status_error(anthropic.BadRequestError, 400)
    with pytest.raises(ImportRefused, match="import_photo_unreadable"):
        timetable_photo.claude_reader("k3", FakeClient(error))(PNG, "image/png", "")


@pytest.mark.parametrize("cls,code", [
    (anthropic.InternalServerError, 529), (anthropic.AuthenticationError, 401), (anthropic.RateLimitError, 429),
])
def test_the_service_or_the_key_failing_is_unavailable_and_logged(cls, code, caplog):
    with pytest.raises(timetable_photo.PhotoUnavailable):
        timetable_photo.claude_reader(f"k{code}", FakeClient(status_error(cls, code)))(PNG, "image/png", "")
    assert f"status={code}" in caplog.text
    assert f"k{code}" not in caplog.text  # never the key


def test_a_timeout_is_unavailable():
    timeout = anthropic.APITimeoutError(request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages"))
    with pytest.raises(timetable_photo.PhotoUnavailable):
        timetable_photo.claude_reader("k5", FakeClient(timeout))(PNG, "image/png", "")


def test_the_reader_comes_from_the_key():
    assert get_photo_reader(Settings(database_url="postgresql+psycopg://u@h/d", _env_file=None)) is None
    with_key = Settings(database_url="postgresql+psycopg://u@h/d", anthropic_api_key="sk-test", _env_file=None)
    assert callable(get_photo_reader(with_key))
    assert get_photo_reader(with_key) is get_photo_reader(with_key)  # one client, kept


def test_the_limit_is_each_persons_own(client, session, braude, with_reader):
    from app.models import User

    with_reader(answer(("ראשון", "08:30", "10:30", "M", None)))
    assert post(client).status_code == 200
    client.user = User(institution_id=braude.id, email="b@braude.example", display_name="B")
    session.add(client.user)
    session.flush()
    assert post(client).status_code == 200


def test_a_photo_too_big_says_so_for_a_photo(client, with_reader):
    with_reader(answer())
    response = post(client, PNG + b"\0" * timetable_photo.MAX_BYTES)
    assert (response.status_code, response.json()["detail"]) == (422, "import_photo_too_big")


def test_a_lecturers_title_the_model_copied_is_taken_out():
    # From the user's check, 25 Oct: "ד"ר" had come into the course's name.
    [row] = timetable_photo.read_photo(PNG, CAMPUS, reader(answer(
        ("שני", "08:30", "10:30", "M", "ד״ר מבנים אלגבריים 2 להנדסת תוכנה, תרגיל"),
    )))
    assert row.title == "מבנים אלגבריים 2 להנדסת תוכנה, תרגיל"


def test_the_prompt_asks_for_no_titles_and_the_names_own_order():
    assert 'ד"ר' in timetable_photo.PROMPT
    assert "in the order written" in timetable_photo.PROMPT
