"""Admin endpoints. An institution admin who asks about another institution
gets 404, exactly as if it did not exist."""

from dataclasses import asdict
from datetime import datetime
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app import campus_import, campus_setup, dns_verify, screens
from app.api.auth import get_http_client
from app.api.deps import get_code_secret, get_session, limited_body
from app.campus_admin import create_building, create_place, mentioned_places
from app.clock import get_now
from app.codes import make_code
from app.config import Settings, get_settings
from app.errors import FOREIGN_KEY_VIOLATION, Refusal, is_duplicate, sqlstate
from app.geocode import SHARED, Geocoder
from app.models import (
    AuthProvider,
    Building,
    CheckInMode,
    Institution,
    InstitutionLoginRule,
    Place,
    PlaceScreen,
    User,
    UserRole,
)
from app.permissions import can_manage, require_admin
from app.ratelimit import campus_import_limit, dns_check_limit, geocode_limit, write_limit
from app.schemas import (
    BuildingCreatedOut,
    BuildingCreateIn,
    BuildingLocationIn,
    BuildingLocationOut,
    CampusImportIn,
    CampusPreviewOut,
    CampusSavedOut,
    ExistingBuildingOut,
    GeocodeResultOut,
    ImportedBuildingOut,
    ImportedPlaceOut,
    ImportProblemOut,
    InstitutionUpdateIn,
    LoginRuleIn,
    LoginRuleOut,
    MentionedPlaceOut,
    PlaceCreatedOut,
    PlaceCreateIn,
    SetupOut,
)

router = APIRouter(prefix="/admin", tags=["admin"])

SessionDep = Annotated[Session, Depends(get_session)]
AdminDep = Annotated[User, Depends(require_admin)]
SecretDep = Annotated[bytes, Depends(get_code_secret)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def _demo_slug(settings: Settings) -> str | None:
    """The shared demo campus, whose additions are capped and reset daily."""
    return settings.demo_institution if settings.demo_login_enabled else None


class PlaceCode(BaseModel):
    place_id: int
    building_code: str
    place_name: str
    code: str
    # Wave 13: a printed sign, or a screen by the door with a new code every minute.
    check_in_mode: CheckInMode = CheckInMode.SIGN
    screen_active: bool = False  # a screen link exists
    screen_last_seen_at: datetime | None = None


def _code(place: Place, building_code: str, secret: bytes, screen: PlaceScreen | None = None) -> PlaceCode:
    return PlaceCode(
        place_id=place.id,
        building_code=building_code,
        place_name=place.name,
        code=make_code(place.id, place.code_version, secret),
        check_in_mode=place.check_in_mode,
        screen_active=screen is not None,
        screen_last_seen_at=screen.last_seen_at if screen else None,
    )


class CheckInModeIn(BaseModel):
    mode: CheckInMode


class ScreenLink(BaseModel):
    """The screen's address, shown once: only an HMAC of its token is kept."""

    url: str
    place: PlaceCode


def _managed_place(db: Session, admin: User, place_id: int) -> Place:
    place = db.scalars(select(Place).where(Place.id == place_id).with_for_update()).first()
    institution = db.get(Institution, place.institution_id) if place else None
    if place is None or not can_manage(admin, institution):
        raise HTTPException(404, "place_not_found")
    return place


@router.get("/institutions/{slug}/codes", response_model=list[PlaceCode])
def list_codes(slug: Annotated[str, Path(max_length=64)], admin: AdminDep, db: SessionDep, secret: SecretDep):
    institution = db.scalars(select(Institution).where(Institution.slug == slug)).first()
    if institution is None or not can_manage(admin, institution):
        raise HTTPException(404, "institution_not_found")
    rows = db.execute(
        select(Place, Building.code)
        .join(Place.building)
        .where(Place.institution_id == institution.id)
        .order_by(Building.id, Place.id)
    ).all()
    ids = [place.id for place, _ in rows]
    shown = {row.place_id: row for row in db.scalars(select(PlaceScreen).where(PlaceScreen.place_id.in_(ids)))}
    return [_code(place, code, secret, shown.get(place.id)) for place, code in rows]


@router.post(
    "/places/{place_id}/revoke-code", response_model=PlaceCode, dependencies=[Depends(write_limit)]
)
def revoke_code(
    place_id: Annotated[int, Path(gt=0)], admin: AdminDep, db: SessionDep, secret: SecretDep
):
    """Invalidate every printed code of a place (for example after a photo
    of it was shared) and return the new one to print."""
    place = _managed_place(db, admin, place_id)
    place.code_version += 1
    db.commit()
    return _code(place, place.building.code, secret, db.get(PlaceScreen, place.id))


@router.patch(
    "/places/{place_id}/check-in-mode", response_model=PlaceCode, dependencies=[Depends(write_limit)]
)
def set_check_in_mode(
    place_id: Annotated[int, Path(gt=0)], body: CheckInModeIn, admin: AdminDep, db: SessionDep, secret: SecretDep
):
    """A printed sign, or a screen by the door. Back on a sign, the screen's
    link ends: a tablet left on would only show a code nobody can use."""
    place = _managed_place(db, admin, place_id)
    place.check_in_mode = body.mode
    if body.mode is CheckInMode.SIGN:
        screens.revoke(db, place)
    db.commit()
    return _code(place, place.building.code, secret, db.get(PlaceScreen, place.id))


@router.post("/places/{place_id}/screen", response_model=ScreenLink, dependencies=[Depends(write_limit)])
def make_screen_link(
    place_id: Annotated[int, Path(gt=0)],
    admin: AdminDep,
    db: SessionDep,
    secret: SecretDep,
    now: Annotated[datetime, Depends(get_now)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    """A new link for the tablet by the door; the old one stops working."""
    place = _managed_place(db, admin, place_id)
    if place.check_in_mode is not CheckInMode.SCREEN:
        raise HTTPException(409, "screen_mode_off")
    token = screens.new_screen(db, place, now, screens.screen_key(settings.jwt_secret_bytes()))
    db.commit()
    # After "#": the browser never sends that part, so the token stays out of every log.
    url = f"{settings.frontend_url.rstrip('/')}/screen#t={token}"
    return ScreenLink(url=url, place=_code(place, place.building.code, secret, db.get(PlaceScreen, place.id)))


@router.delete("/places/{place_id}/screen", response_model=PlaceCode, dependencies=[Depends(write_limit)])
def remove_screen_link(place_id: Annotated[int, Path(gt=0)], admin: AdminDep, db: SessionDep, secret: SecretDep):
    place = _managed_place(db, admin, place_id)
    screens.revoke(db, place)
    db.commit()
    return _code(place, place.building.code, secret)


@router.post(
    "/buildings/{building_id}/location",
    response_model=BuildingLocationOut,
    dependencies=[Depends(write_limit)],
)
def place_building(
    building_id: Annotated[int, Path(gt=0)], body: BuildingLocationIn, admin: AdminDep, db: SessionDep
):
    """Put a building on the map, where the admin clicked."""
    building = db.get(Building, building_id)
    institution = db.get(Institution, building.institution_id) if building else None
    if building is None or not can_manage(admin, institution):
        raise HTTPException(404, "building_not_found")
    building.latitude, building.longitude = body.latitude, body.longitude
    db.commit()
    return BuildingLocationOut(
        id=building.id, code=building.code, latitude=building.latitude, longitude=building.longitude
    )


@router.post(
    "/institutions/{slug}/buildings",
    status_code=status.HTTP_201_CREATED,
    response_model=BuildingCreatedOut,
    dependencies=[Depends(write_limit)],
)
def add_building(
    slug: Annotated[str, Path(max_length=64)],
    body: BuildingCreateIn,
    admin: AdminDep,
    db: SessionDep,
    settings: SettingsDep,
):
    """A new building of the institution. Its position is optional: it can
    be placed on the map afterwards, like any other building."""
    institution = db.scalars(select(Institution).where(Institution.slug == slug)).first()
    if institution is None or not can_manage(admin, institution):
        raise HTTPException(404, "institution_not_found")
    position = (body.latitude, body.longitude) if body.latitude is not None else None
    try:
        building = create_building(
            db,
            institution,
            code=body.code,
            name=body.name or None,
            floors_count=body.floors_count,
            status=body.status,
            position=position,
            demo_slug=_demo_slug(settings),
        )
        db.commit()
    except Refusal as refusal:
        raise HTTPException(refusal.status, refusal.code) from None
    except IntegrityError as error:
        if not is_duplicate(error):
            raise
        # The same code added in another tab a moment ago.
        db.rollback()
        raise HTTPException(409, "building_code_taken") from None
    return BuildingCreatedOut(
        id=building.id,
        code=building.code,
        name=building.name,
        floors_count=building.floors_count,
        latitude=building.latitude,
        longitude=building.longitude,
    )


@router.post(
    "/buildings/{building_id}/places",
    status_code=status.HTTP_201_CREATED,
    response_model=PlaceCreatedOut,
    dependencies=[Depends(write_limit)],
)
def add_place(
    building_id: Annotated[int, Path(gt=0)],
    body: PlaceCreateIn,
    admin: AdminDep,
    db: SessionDep,
    settings: SettingsDep,
):
    """A new place, open at the campus's usual hours, with its sign ready
    to print. A computer lab gets one station per row and column."""
    building = db.get(Building, building_id)
    institution = db.get(Institution, building.institution_id) if building else None
    if building is None or not can_manage(admin, institution):
        raise HTTPException(404, "building_not_found")
    try:
        place = create_place(db, building, body.model_dump(), demo_slug=_demo_slug(settings))
        db.commit()
    except Refusal as refusal:
        raise HTTPException(refusal.status, refusal.code) from None
    except IntegrityError as error:
        # The building deleted at the same moment (an import replacing it,
        # the demo reset) trips a foreign key: a race too, not a bug.
        if not (is_duplicate(error) or sqlstate(error) == FOREIGN_KEY_VIOLATION):
            raise
        db.rollback()
        raise HTTPException(409, "place_name_taken") from None
    return PlaceCreatedOut(
        id=place.id, building_id=building.id, name=place.name, kind=place.kind, capacity=place.capacity
    )


# --- A table of buildings and places (app/campus_import.py) ------------------------------


@router.post(
    "/institutions/{slug}/import/preview",
    response_model=CampusPreviewOut,
    dependencies=[Depends(campus_import_limit)],
)
async def preview_campus_import(
    slug: Annotated[str, Path(max_length=64)],
    request: Request,
    admin: AdminDep,
    db: SessionDep,
    settings: SettingsDep,
    now: Annotated[datetime, Depends(get_now)],
):
    """A table of buildings and places, sent as the request body: what it
    holds, line by line, and which buildings are there already with what
    deleting them would take. Nothing is saved, and the file is not kept."""
    institution = await run_in_threadpool(_managed, db, admin, slug)
    data = await limited_body(request, campus_import.MAX_BYTES)
    try:
        table = await run_in_threadpool(campus_import.read_table, data)
    except campus_import.ImportRefused as refused:
        raise HTTPException(422, refused.code) from None
    # The answer reads the buildings' places: built in the thread too, so
    # no query ever runs on the event loop.
    return await run_in_threadpool(_preview, db, institution, table, now, _demo_slug(settings))


def _preview(db: Session, institution: Institution, table, now: datetime, demo_slug: str | None) -> CampusPreviewOut:
    there = campus_import.existing(db, institution, [b.code for b in table.buildings], now, demo_slug=demo_slug)
    buildings = []
    for b in table.buildings:
        found = there.get(b.code)
        buildings.append(ImportedBuildingOut(
            code=b.code, name=b.name, floors_count=b.floors_count, status=b.status,
            latitude=b.latitude, longitude=b.longitude,
            existing=ExistingBuildingOut(**asdict(found[1])) if found else None,
            places=[
                ImportedPlaceOut(
                    line=line, **place.model_dump(),
                    when_added=campus_import.when_added(found[0], place) if found else None,
                )
                for line, place in b.places
            ],
        ))
    problems = [ImportProblemOut(line=line, code=code) for line, code in table.problems]
    return CampusPreviewOut(buildings=buildings, problems=problems)


@router.post(
    "/institutions/{slug}/import", response_model=CampusSavedOut, dependencies=[Depends(campus_import_limit)]
)
def save_campus_import(
    slug: Annotated[str, Path(max_length=64)],
    body: CampusImportIn,
    admin: AdminDep,
    db: SessionDep,
    settings: SettingsDep,
    now: Annotated[datetime, Depends(get_now)],
):
    """The table as the admin confirmed it, in one transaction: every
    building and place is checked again as in the forms, and one refusal
    saves nothing."""
    institution = _managed(db, admin, slug, lock=True)
    try:
        saved = campus_import.save(db, institution, body.buildings, now, demo_slug=_demo_slug(settings))
        db.commit()
    except Refusal as refusal:
        db.rollback()
        raise HTTPException(refusal.status, refusal.code) from None
    except IntegrityError as error:
        # The building deleted at the same moment (an import replacing it,
        # the demo reset) trips a foreign key: a race too, not a bug.
        if not (is_duplicate(error) or sqlstate(error) == FOREIGN_KEY_VIOLATION):
            raise
        # The same building or place added in another tab a moment ago.
        db.rollback()
        raise HTTPException(409, "import_stale") from None
    return CampusSavedOut(**asdict(saved))


# --- The institution's own setup: details, who signs in, opening it ----------


def _managed(db: Session, admin: User, slug: str, lock: bool = False) -> Institution:
    query = select(Institution).where(Institution.slug == slug)
    institution = db.scalars(query.with_for_update() if lock else query).first()
    if institution is None or not can_manage(admin, institution):
        raise HTTPException(404, "institution_not_found")
    return institution


def _refuse_demo(institution: Institution, settings: Settings) -> None:
    # The demo admin is shared by every visitor of the live site.
    if institution.slug == _demo_slug(settings):
        raise HTTPException(403, "demo_campus_locked")


@router.get("/institutions/{slug}/mentioned-places", response_model=list[MentionedPlaceOut])
def get_mentioned_places(
    slug: Annotated[str, Path(max_length=64)], admin: AdminDep, db: SessionDep, settings: SettingsDep
):
    """Places named in students' timetables that the campus does not list:
    for the admin to add. How many students, never who."""
    institution = _managed(db, admin, slug)
    return [
        MentionedPlaceOut(text=text, students=count)
        for text, count in mentioned_places(db, institution, demo_slug=_demo_slug(settings))
    ]


@router.get("/institutions/{slug}/setup", response_model=SetupOut)
def get_setup(slug: Annotated[str, Path(max_length=64)], admin: AdminDep, db: SessionDep, settings: SettingsDep):
    institution = _managed(db, admin, slug)
    buildings, located, places = campus_setup.setup_counts(db, institution)
    return SetupOut(
        slug=institution.slug,
        name=institution.name,
        timezone=institution.timezone,
        is_active=institution.is_active,
        locked=institution.slug == _demo_slug(settings),
        rules=[LoginRuleOut.model_validate(r) for r in institution.login_rules],
        buildings=buildings,
        located_buildings=located,
        places=places,
        microsoft_client_id=settings.microsoft_client_id,
    )


@router.patch("/institutions/{slug}", response_model=SetupOut, dependencies=[Depends(write_limit)])
def update_institution(
    slug: Annotated[str, Path(max_length=64)], body: InstitutionUpdateIn, admin: AdminDep, db: SessionDep,
    settings: SettingsDep,
):
    # Locked: waiting behind a delete of it ends in a clean 404, not a 500.
    institution = _managed(db, admin, slug, lock=True)
    _refuse_demo(institution, settings)
    if institution.closes_at is not None:
        raise HTTPException(409, "institution_closing")  # it would show again in the list
    for field, value in body.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(institution, field, value)
    db.commit()
    return get_setup(slug, admin, db, settings)


@router.post(
    "/institutions/{slug}/login-rules",
    status_code=status.HTTP_201_CREATED,
    response_model=LoginRuleOut,
    dependencies=[Depends(write_limit)],
)
def add_login_rule(
    slug: Annotated[str, Path(max_length=64)], body: LoginRuleIn, admin: AdminDep, db: SessionDep,
    settings: SettingsDep,
):
    institution = _managed(db, admin, slug)
    _refuse_demo(institution, settings)
    if institution.closes_at is not None:
        raise HTTPException(409, "institution_closing")
    try:
        # The system admin's own rule works at once; anyone else's waits for them.
        approved = admin.role == UserRole.SYSTEM_ADMIN
        created = campus_setup.add_login_rule(db, institution, AuthProvider(body.provider), body.value, approved)
        db.commit()
    except Refusal as refusal:
        raise HTTPException(refusal.status, refusal.code) from None
    except IntegrityError as error:  # the same rule, added a moment ago elsewhere
        if not is_duplicate(error):
            raise
        db.rollback()
        raise HTTPException(409, "login_rule_taken") from None
    return created


@router.post("/login-rules/{rule_id}/verify", response_model=LoginRuleOut, dependencies=[Depends(dns_check_limit)])
def verify_login_rule(
    rule_id: Annotated[int, Path(gt=0)],
    admin: AdminDep,
    db: SessionDep,
    settings: SettingsDep,
    http: Annotated[httpx.Client, Depends(get_http_client)],
):
    """The TXT record is there: the rule works now, as if the system admin
    approved it, with the same checks (app/campus_setup.py)."""
    found = db.get(InstitutionLoginRule, rule_id)
    institution = db.get(Institution, found.institution_id) if found else None
    if found is None or not can_manage(admin, institution):
        raise HTTPException(404, "login_rule_not_found")
    _refuse_demo(institution, settings)
    # The open campus too: an approved rule there would stop it being open.
    if institution.slug == settings.open_sign_in_institution:
        raise HTTPException(403, "demo_campus_locked")
    if institution.closes_at is not None:
        raise HTTPException(409, "institution_closing")
    if found.approved or found.verify_token is None:
        raise HTTPException(409, "login_rule_not_verifiable")  # a Microsoft tenant has no domain
    value, token = found.value, found.verify_token
    db.rollback()  # no lock or transaction held while the resolver answers
    if not dns_verify.has_proof(http, settings.dns_resolver_url, value, token):
        raise HTTPException(409, "dns_record_not_found")
    rule = db.get(InstitutionLoginRule, rule_id, with_for_update=True)
    if rule is None:
        raise HTTPException(404, "login_rule_not_found")  # removed meanwhile
    if rule.verify_token != token:
        raise HTTPException(409, "login_rule_not_verifiable")  # approved meanwhile
    try:
        campus_setup.approve_login_rule(db, rule)
    except Refusal as refusal:
        db.rollback()
        raise HTTPException(refusal.status, refusal.code) from None
    db.commit()
    return rule


@router.delete(
    "/login-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(write_limit)]
)
def remove_login_rule(
    rule_id: Annotated[int, Path(gt=0)], admin: AdminDep, db: SessionDep, settings: SettingsDep
) -> None:
    found = db.get(InstitutionLoginRule, rule_id)
    institution = db.get(Institution, found.institution_id) if found else None
    if found is None or not can_manage(admin, institution):
        raise HTTPException(404, "login_rule_not_found")
    _refuse_demo(institution, settings)
    try:
        campus_setup.remove_login_rule(db, found)
    except Refusal as refusal:
        raise HTTPException(refusal.status, refusal.code) from None
    db.commit()


@router.get("/geocode", response_model=list[GeocodeResultOut], dependencies=[Depends(geocode_limit)])
def geocode(
    q: Annotated[str, Query(min_length=2, max_length=120)],
    admin: AdminDep,
    settings: SettingsDep,
    http: Annotated[httpx.Client, Depends(get_http_client)],
):
    """Where a place is, for the admin's map. Only on a press of "search"."""
    site = settings.site_url or settings.frontend_url
    geocoder = Geocoder(http, settings.geocoder_url, f"StudySpot campus finder (+{site})", shared=SHARED)
    try:
        return geocoder.search(q)
    except Refusal as refusal:
        raise HTTPException(refusal.status, refusal.code) from None
