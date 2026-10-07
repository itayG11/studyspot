"""Admin endpoints. An institution admin who asks about another institution
gets 404, exactly as if it did not exist."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_code_secret, get_session
from app.codes import make_code
from app.models import Building, Institution, Place, User
from app.permissions import can_manage, require_admin
from app.ratelimit import write_limit
from app.schemas import BuildingLocationIn, BuildingLocationOut

router = APIRouter(prefix="/admin", tags=["admin"])

SessionDep = Annotated[Session, Depends(get_session)]
AdminDep = Annotated[User, Depends(require_admin)]
SecretDep = Annotated[bytes, Depends(get_code_secret)]


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
