"""The public list of institutions: only the ones marked active."""

from app.config import Settings, get_settings
from app.main import app
from app.models import Institution, InstitutionLoginRule
from app.seed import seed_demo


def test_lists_only_active_institutions(client, session, braude):
    seed_demo(session)
    hidden = Institution(name="מוסד בהקמה", slug="setting-up", timezone="Asia/Jerusalem")
    session.add(hidden)
    session.flush()

    client.user = None
    response = client.get("/institutions")
    assert response.status_code == 200
    # Braude waits for the college; a new institution waits for its admin.
    assert [(i["slug"], i["name"]) for i in response.json()] == [("demo", "קמפוס הדגמה")]


def test_each_institution_says_how_many_buildings_and_places_it_has(client, session):
    # For the cards on the institutions page.
    demo = seed_demo(session)
    settings = Settings(database_url="postgresql+psycopg://unused@localhost/unused", demo_login_enabled=True, _env_file=None)
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        [card] = client.get("/institutions").json()
    finally:
        app.dependency_overrides.pop(get_settings, None)
    assert card["buildings_count"] == len(demo.buildings)
    assert card["places_count"] == sum(len(b.places) for b in demo.buildings)
    assert card["is_demo"] is True  # with the demo sign-in on
    # With real sign-in rules it is not the open demo any more.
    session.add(InstitutionLoginRule(institution_id=demo.id, provider="email", value="example.ac.il", approved=True))
    session.expire(demo)
    session.flush()
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        assert client.get("/institutions").json()[0]["is_demo"] is False
    finally:
        app.dependency_overrides.pop(get_settings, None)
    # Off (a site for real students only): no card says "demo".
    assert client.get("/institutions").json()[0]["is_demo"] is False


def test_a_hidden_institution_still_opens_by_its_address(client, session):
    # Its admin sets it up there before marking it active.
    session.add(Institution(name="מוסד בהקמה", slug="setting-up", timezone="Asia/Jerusalem"))
    session.flush()
    client.user = None
    assert client.get("/institutions/setting-up").status_code == 200


def test_new_institutions_start_hidden(session):
    institution = Institution(name="חדש", slug="new-one", timezone="Asia/Jerusalem")
    session.add(institution)
    session.flush()
    assert institution.is_active is False


def test_the_list_is_sorted_by_name(client, session):
    for name, slug in (("תל חי", "tel-hai"), ("אריאל", "ariel")):
        session.add(Institution(name=name, slug=slug, timezone="Asia/Jerusalem", is_active=True))
    session.flush()
    names = [i["name"] for i in client.get("/institutions").json()]
    assert names == sorted(names)


def test_a_place_says_which_institution_it_belongs_to(client, braude):
    # Old links (/spaces/7) carry no institution; the site reads it here.
    place = braude.buildings[0].places[0]
    client.user = None
    assert client.get(f"/places/{place.id}").json()["institution_slug"] == "braude"


def test_an_address_the_database_could_never_hold_is_refused_early(client):
    # The same rule as the slug_format check: no leading, trailing or double dash.
    for slug in ("-x", "x-", "tel--hai"):
        assert client.get(f"/institutions/{slug}").status_code == 422
