"""One rule for "which building is this?", in all three imports and the
manual form (wave 7.5): a building's short name or full name, whatever the
case and the spacing. The imports used to differ: the Excel one compared
full names exactly, so "sports hall" did not find "Sports Hall"."""

from types import SimpleNamespace

from app.classes import match_building
from app.timetable_import import _building
from app.timetable_photo import _listed

M = SimpleNamespace(code="M", name="בניין ההנדסה")
SPORT = SimpleNamespace(code="SP", name="Sports Hall")
BUILDINGS = [M, SPORT]


def test_a_short_or_full_name_whatever_the_case_and_spacing():
    assert match_building("m", BUILDINGS) is M
    assert match_building("  sports   HALL ", BUILDINGS) is SPORT
    assert match_building("בניין  ההנדסה", BUILDINGS) is M


def test_anything_else_is_no_building():
    assert match_building("אולם ספורט", BUILDINGS) is None
    assert match_building("", BUILDINGS) is None


def test_the_excel_import_finds_a_full_name_in_another_case():
    assert _building(["sports", "hall", "sports", "hall"], BUILDINGS) == ("SP", "sports hall")


def test_the_photo_import_follows_the_same_rule():
    assert _listed("sports  hall", BUILDINGS) == "SP"
    assert _listed("219 m", BUILDINGS) == "M"
