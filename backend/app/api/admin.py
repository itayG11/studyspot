"""Admin endpoints. An institution admin who asks about another institution
gets 404, exactly as if it did not exist."""

from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import campus_setup
from app.api.auth import get_http_client
from app.api.deps import get_code_secret, get_session
from app.campus_admin import create_building, create_place
from app.codes import make_code
from app.config import Settings, get_settings
from app.errors import Refusal
from app.geocode import SHARED, Geocoder
from app.models import AuthProvider, Building, Institution, InstitutionLoginRule, Place, User, UserRole
from app.permissions import can_manage, require_admin
from app.ratelimit import geocode_limit, write_limit
from app.schemas import (
    BuildingCreatedOut,
    BuildingCreateIn,
    BuildingLocationIn,
    BuildingLocationOut,
    GeocodeResultOut,
    InstitutionUpdateIn,
    LoginRuleIn,
    LoginRuleOut,
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


def _code(place: Place, building_code: str, secret: bytes) -> PlaceCode:
    return PlaceCode(
        place_id=place.id,
        building_code=building_code,
        place_name=place.name,
        code=make_code(place.id, place.code_version, secret),
    )


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
    return [_code(place, code, secret) for place, code in rows]


@router.post(
    "/places/{place_id}/revoke-code", response_model=PlaceCode, dependencies=[Depends(write_limit)]
)
def revoke_code(
    place_id: Annotated[int, Path(gt=0)], admin: AdminDep, db: SessionDep, secret: SecretDep
):
    """Invalidate every printed code of a place (for example after a photo
    of it was shared) and return the new one to print."""
    place = db.scalars(select(Place).where(Place.id == place_id).with_for_update()).first()
    institution = db.get(Institution, place.institution_id) if place else None
    if place is None or not can_manage(admin, institution):
        raise HTTPException(404, "place_not_found")
    place.code_version += 1
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
    except IntegrityError:
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
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "place_name_taken") from None
    return PlaceCreatedOut(
        id=place.id, building_id=building.id, name=place.name, kind=place.kind, capacity=place.capacity
    )


# --- The institution's own setup: details, who signs in, opening it ----------


def _managed(db: Session, admin: User, slug: str) -> Institution:
    institution = db.scalars(select(Institution).where(Institution.slug == slug)).first()
    if institution is None or not can_manage(admin, institution):
        raise HTTPException(404, "institution_not_found")
    return institution


def _refuse_demo(institution: Institution, settings: Settings) -> None:
    # The demo admin is shared by every visitor of the live site.
    if institution.slug == _demo_slug(settings):
        raise HTTPException(403, "demo_campus_locked")


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
    institution = _managed(db, admin, slug)
    _refuse_demo(institution, settings)
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
    try:
        # The system admin's own rule works at once; anyone else's waits for them.
        approved = admin.role == UserRole.SYSTEM_ADMIN
        created = campus_setup.add_login_rule(db, institution, AuthProvider(body.provider), body.value, approved)
        db.commit()
    except Refusal as refusal:
        raise HTTPException(refusal.status, refusal.code) from None
    except IntegrityError:  # the same rule, added a moment ago elsewhere
        db.rollback()
        raise HTTPException(409, "login_rule_taken") from None
    return created


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
