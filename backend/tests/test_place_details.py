"""What a place is like (atmosphere, who it suits, equipment), and when a
group room is free. The Braude details are demo values, and say so."""

from datetime import datetime
from zoneinfo import ZoneInfo

from conftest import place_named
from factories import assert_rejected, make_building, make_institution, make_place
from sqlalchemy.orm import Session

from app.models import Amenity, Institution, PlaceAmenity, PlaceAtmosphere, SuitedFor

TZ = ZoneInfo("Asia/Jerusalem")


def local(*args) -> datetime:
    return datetime(*args, tzinfo=TZ)


# --- The database rules ---------------------------------------------------------------


def test_a_place_has_an_atmosphere_and_who_it_suits(session: Session):
    place = make_place(session, make_building(session, make_institution(session)))
    assert place.atmosphere == PlaceAtmosphere.MIXED  # the default
    assert place.suited_for == SuitedFor.BOTH
    assert place.details_are_demo is False


def test_an_amenity_is_listed_once_per_place(session: Session):
    place = make_place(session, make_building(session, make_institution(session)))
    session.add(PlaceAmenity(place_id=place.id, amenity=Amenity.OUTLETS))
    session.flush()
    assert_rejected(
        session,
        lambda: session.add(PlaceAmenity(place_id=place.id, amenity=Amenity.OUTLETS)),
        "uq_place_amenities_place_id_amenity",
    )


# --- The Braude demo data ---------------------------------------------------------------


def test_every_braude_place_has_demo_details(braude: Institution):
    places = [p for b in braude.buildings for p in b.places]
    assert len(places) == 10
    assert all(p.details_are_demo for p in places)
    assert all(p.amenities for p in places)
    labs = [p for p in places if p.kind == "computer_lab"]
    assert all(Amenity.COMPUTERS in {a.amenity for a in p.amenities} for p in labs)
    assert place_named(braude, "EM", "EM107").suited_for == SuitedFor.GROUP


def test_seeding_again_fills_details_of_older_databases(session: Session, braude: Institution):
    from app.seed import seed_braude

    room = place_named(braude, "EM", "EM107")
    room.amenities.clear()
    room.details_are_demo = False
    session.flush()
    seed_braude(session)
    assert room.details_are_demo is True
    assert room.amenities


# --- The API --------------------------------------------------------------------------


def test_places_carry_their_details(client):
    places = {p["name"]: p for p in client.get("/institutions/braude/places?building=EM").json()}
    room = places["EM107"]
    assert room["atmosphere"] in {"quiet", "conversation", "mixed"}
    assert room["suited_for"] == "group"
    assert room["details_are_demo"] is True
    assert room["amenities"] == sorted(room["amenities"])  # a stable order for the site
    assert "whiteboard" in room["amenities"]


def test_a_free_group_room_is_free_now(client):
    room = next(p for p in client.get("/institutions/braude/places?building=EM").json() if p["name"] == "EM107")
    assert (room["free_now"], room["free_from"]) == (True, None)


def test_a_booked_room_says_when_it_frees_up_even_after_back_to_back_bookings(client, braude):
    room = place_named(braude, "EM", "EM107")
    for start, end in [((10, 0), (11, 0)), ((11, 0), (12, 0))]:
        body = {
            "place_id": room.id,
            "starts_at": local(2026, 10, 11, *start).isoformat(),
            "ends_at": local(2026, 10, 11, *end).isoformat(),
        }
        assert client.post("/bookings", json=body).status_code == 201
    client.clock.now = local(2026, 10, 11, 10, 5).astimezone(ZoneInfo("UTC"))

    room_view = next(p for p in client.get("/institutions/braude/places?building=EM").json() if p["name"] == "EM107")
    assert room_view["free_now"] is False
    assert datetime.fromisoformat(room_view["free_from"]) == local(2026, 10, 11, 12, 0)


def test_free_now_is_only_for_group_rooms(client):
    places = client.get("/institutions/braude/places").json()
    assert all(p["free_now"] is None for p in places if p["kind"] != "group_room")


def test_a_closed_room_is_not_free_now(client):
    client.clock.now = local(2026, 10, 11, 22, 0).astimezone(ZoneInfo("UTC"))
    room = next(p for p in client.get("/institutions/braude/places?building=EM").json() if p["name"] == "EM107")
    assert room["free_now"] is False
    assert room["free_from"] is None
