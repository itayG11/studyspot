"""The admin's "Connections" tab (wave 14): the institution's API keys
(app/api_keys.py). The same rule as every admin endpoint: another
institution's admin gets 404, as if it did not exist."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Response, status
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app import api_keys
from app.api.admin import AdminDep, SessionDep, SettingsDep, _demo_slug, _managed
from app.clock import get_now
from app.errors import Refusal
from app.models import ApiKey
from app.ratelimit import write_limit

router = APIRouter(prefix="/admin", tags=["admin"])

NowDep = Annotated[datetime, Depends(get_now)]
Slug = Annotated[str, Path(max_length=64)]


class ApiKeyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # What it is for, so the admin knows which one to revoke: "the library's screen".
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class ApiKeyOut(BaseModel):
    id: int
    name: str
    prefix: str
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None


class ApiKeyCreated(BaseModel):
    """The key itself is here once only: the server keeps an HMAC of it."""

    key: str = Field(description="ss_live_...")
    api_key: ApiKeyOut


def _out(row: ApiKey) -> ApiKeyOut:
    return ApiKeyOut(
        id=row.id,
        name=row.name,
        prefix=row.prefix,
        created_at=row.created_at,
        last_used_at=row.last_used_at,
        revoked_at=row.revoked_at,
    )


def _key(settings) -> bytes:
    return api_keys.api_key_key(settings.jwt_secret_bytes())


@router.get("/institutions/{slug}/api-keys", response_model=list[ApiKeyOut])
def list_api_keys(slug: Slug, admin: AdminDep, db: SessionDep):
    return [_out(row) for row in api_keys.all_keys(db, _managed(db, admin, slug))]


@router.post(
    "/institutions/{slug}/api-keys",
    response_model=ApiKeyCreated,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(write_limit)],
)
def make_api_key(slug: Slug, body: ApiKeyIn, admin: AdminDep, db: SessionDep, now: NowDep, settings: SettingsDep):
    # The row lock: two at once cannot both pass the limit of active keys.
    institution = _managed(db, admin, slug, lock=True)
    # The demo admin is every visitor: a new key retires the oldest instead
    # of locking the next visitor out.
    rotate = institution.slug == _demo_slug(settings)
    try:
        row, raw = api_keys.new_key(db, institution, body.name, admin, now, _key(settings), rotate=rotate)
    except Refusal as refusal:
        raise HTTPException(refusal.status, refusal.code) from None
    db.commit()
    return ApiKeyCreated(key=raw, api_key=_out(row))


@router.delete(
    "/institutions/{slug}/api-keys/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(write_limit)],
)
def revoke_api_key(slug: Slug, key_id: Annotated[int, Path(gt=0)], admin: AdminDep, db: SessionDep, now: NowDep):
    if not api_keys.revoke(db, _managed(db, admin, slug), key_id, now):
        raise HTTPException(404, "api_key_not_found")
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
