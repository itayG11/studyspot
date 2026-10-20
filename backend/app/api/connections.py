"""The admin's "Connections" tab (wave 14): the institution's API keys
(app/api_keys.py). The same rule as every admin endpoint: another
institution's admin gets 404, as if it did not exist."""

from collections.abc import Callable
from datetime import datetime
from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Path, Response, status
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import func, select

from app import api_keys, webhooks
from app.api.admin import AdminDep, SessionDep, SettingsDep, _demo_slug, _managed, _refuse_demo
from app.clock import get_now
from app.errors import Refusal
from app.models import ApiKey, DeliveryStatus, Institution, WebhookDelivery, WebhookEndpoint
from app.permissions import can_manage
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


# --- webhooks (app/webhooks.py) -------------------------------------------------------

ClientDep = Annotated[httpx.AsyncBaseTransport | None, Depends(webhooks.get_transport)]
ResolveDep = Annotated[Callable, Depends(webhooks.get_resolver)]
EventName = Literal["checkin.started", "checkin.ended", "booking.created", "booking.cancelled"]


class WebhookIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: Annotated[str, StringConstraints(strip_whitespace=True, min_length=8, max_length=500)]
    events: list[EventName] = Field(min_length=1, max_length=4)


class WebhookUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    events: list[EventName] | None = Field(default=None, min_length=1, max_length=4)
    active: bool | None = None


class WebhookOut(BaseModel):
    id: int
    url: str
    events: list[str]
    active: bool
    built_in: bool
    created_at: datetime


class WebhookCreated(BaseModel):
    """The signing secret is here once only; it is derived, never stored."""

    secret: str
    webhook: WebhookOut


class DeliveryOut(BaseModel):
    id: int
    event_id: str
    event_type: str
    status: DeliveryStatus
    attempts: int
    last_status_code: int | None
    last_error: str | None
    created_at: datetime
    delivered_at: datetime | None
    next_attempt_at: datetime | None


def _webhook_out(row: WebhookEndpoint) -> WebhookOut:
    return WebhookOut(
        id=row.id, url=row.url, events=row.events, active=row.active, built_in=row.built_in, created_at=row.created_at
    )


def _delivery_out(row: WebhookDelivery) -> DeliveryOut:
    return DeliveryOut(
        id=row.id,
        event_id=row.event_id,
        event_type=row.event_type,
        status=row.status,
        attempts=row.attempts,
        last_status_code=row.last_status_code,
        last_error=row.last_error,
        created_at=row.created_at,
        delivered_at=row.delivered_at,
        next_attempt_at=row.next_attempt_at if row.status is DeliveryStatus.PENDING else None,
    )


def _hook_key(settings) -> bytes:
    return webhooks.webhook_key(settings.jwt_secret_bytes())


def _managed_endpoint(db, admin, endpoint_id: int, lock: bool = False) -> WebhookEndpoint:
    query = select(WebhookEndpoint).where(WebhookEndpoint.id == endpoint_id)
    row = db.scalars(query.with_for_update() if lock else query).first()
    institution = db.get(Institution, row.institution_id) if row else None
    if row is None or not can_manage(admin, institution):
        raise HTTPException(404, "webhook_not_found")
    return row


def _not_built_in(row: WebhookEndpoint) -> None:
    # The demo's tester (wave 14.5) is the server's, not a visitor's.
    if row.built_in:
        raise HTTPException(403, "webhook_built_in")


@router.get("/institutions/{slug}/webhooks", response_model=list[WebhookOut])
def list_webhooks(slug: Slug, admin: AdminDep, db: SessionDep):
    institution = _managed(db, admin, slug)
    rows = db.scalars(
        select(WebhookEndpoint).where(WebhookEndpoint.institution_id == institution.id).order_by(WebhookEndpoint.id)
    )
    return [_webhook_out(row) for row in rows]


@router.post(
    "/institutions/{slug}/webhooks",
    response_model=WebhookCreated,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(write_limit)],
)
def add_webhook(
    slug: Slug, body: WebhookIn, admin: AdminDep, db: SessionDep, now: NowDep, settings: SettingsDep, resolve: ResolveDep
):
    institution = _managed(db, admin, slug, lock=True)
    # The demo admin is every visitor: an address they add would have our
    # server call anywhere they like. The demo has its built-in tester instead.
    _refuse_demo(institution, settings)
    count = db.scalar(
        select(func.count()).select_from(WebhookEndpoint).where(WebhookEndpoint.institution_id == institution.id)
    )
    if count >= webhooks.MAX_ENDPOINTS:
        raise HTTPException(409, "webhook_limit")
    problem = webhooks.url_problem(body.url, settings.webhook_allow_private, resolve)
    if problem is not None:
        raise HTTPException(422, problem)
    row = WebhookEndpoint(
        institution_id=institution.id, url=body.url, events=sorted(set(body.events)), active=True, created_at=now
    )
    db.add(row)
    db.flush()
    secret = webhooks.secret_for(_hook_key(settings), row)
    db.commit()
    return WebhookCreated(secret=secret, webhook=_webhook_out(row))


@router.patch("/webhooks/{endpoint_id}", response_model=WebhookOut, dependencies=[Depends(write_limit)])
def update_webhook(endpoint_id: Annotated[int, Path(gt=0)], body: WebhookUpdate, admin: AdminDep, db: SessionDep):
    row = _managed_endpoint(db, admin, endpoint_id, lock=True)
    _not_built_in(row)
    if body.events is not None:
        row.events = sorted(set(body.events))
    if body.active is not None:
        row.active = body.active
    db.commit()
    return _webhook_out(row)


@router.post("/webhooks/{endpoint_id}/secret", response_model=WebhookCreated, dependencies=[Depends(write_limit)])
def new_webhook_secret(endpoint_id: Annotated[int, Path(gt=0)], admin: AdminDep, db: SessionDep, settings: SettingsDep):
    """The old secret stops matching at once: the receiver needs the new one."""
    row = _managed_endpoint(db, admin, endpoint_id, lock=True)
    _not_built_in(row)
    row.secret_version += 1
    db.commit()
    return WebhookCreated(secret=webhooks.secret_for(_hook_key(settings), row), webhook=_webhook_out(row))


@router.delete("/webhooks/{endpoint_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(write_limit)])
def delete_webhook(endpoint_id: Annotated[int, Path(gt=0)], admin: AdminDep, db: SessionDep):
    row = _managed_endpoint(db, admin, endpoint_id, lock=True)
    _not_built_in(row)
    db.delete(row)  # its log goes with it (ON DELETE CASCADE)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/webhooks/{endpoint_id}/test", response_model=DeliveryOut, dependencies=[Depends(write_limit)])
def test_webhook(
    endpoint_id: Annotated[int, Path(gt=0)],
    admin: AdminDep,
    db: SessionDep,
    now: NowDep,
    settings: SettingsDep,
    client: ClientDep,
    resolve: ResolveDep,
):
    """A test.ping, sent within the request: the admin sees the answer at once."""
    row = _managed_endpoint(db, admin, endpoint_id)
    delivery = webhooks.send_now(
        db, row, webhooks.test_payload(now), client, _hook_key(settings), now, settings.webhook_allow_private, resolve
    )
    db.commit()
    return _delivery_out(delivery)


@router.get("/webhooks/{endpoint_id}/deliveries", response_model=list[DeliveryOut])
def list_deliveries(endpoint_id: Annotated[int, Path(gt=0)], admin: AdminDep, db: SessionDep):
    row = _managed_endpoint(db, admin, endpoint_id)
    rows = db.scalars(
        select(WebhookDelivery)
        .where(WebhookDelivery.endpoint_id == row.id)
        .order_by(WebhookDelivery.id.desc())
        .limit(50)
    )
    return [_delivery_out(d) for d in rows]


@router.post(
    "/webhook-deliveries/{delivery_id}/redeliver", response_model=DeliveryOut, dependencies=[Depends(write_limit)]
)
def redeliver(
    delivery_id: Annotated[int, Path(gt=0)],
    admin: AdminDep,
    db: SessionDep,
    now: NowDep,
    settings: SettingsDep,
    client: ClientDep,
    resolve: ResolveDep,
):
    """The same event again (same id, so the receiver can tell), as a new row."""
    old = db.get(WebhookDelivery, delivery_id)
    if old is None:
        raise HTTPException(404, "delivery_not_found")
    try:
        row = _managed_endpoint(db, admin, old.endpoint_id)
    except HTTPException:
        raise HTTPException(404, "delivery_not_found") from None
    delivery = webhooks.send_now(
        db, row, old.payload, client, _hook_key(settings), now, settings.webhook_allow_private, resolve
    )
    db.commit()
    return _delivery_out(delivery)
