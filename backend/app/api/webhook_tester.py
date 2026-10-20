"""The demo campus's webhook tester (app/webhook_tester.py): the receiver,
which our own deliveries call over HTTP, and the admin's view of it."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Request, Response
from pydantic import BaseModel, ConfigDict

from app import webhook_tester, webhooks
from app.api.admin import AdminDep, SessionDep, SettingsDep, _demo_slug, _managed
from app.api.connections import ClientDep, DeliveryOut, ResolveDep, WebhookOut, _delivery_out, _webhook_out
from app.api.deps import limited_body
from app.clock import get_now
from app.ratelimit import per_ip, write_limit

router = APIRouter(tags=["webhook tester"])

NowDep = Annotated[datetime, Depends(get_now)]
Slug = Annotated[str, Path(max_length=64)]
tester_limit = per_ip("webhook-tester", limit=120, window_seconds=60, evict=True)


class TestHitOut(BaseModel):
    id: int
    received_at: datetime
    event_type: str | None
    event_id: str | None
    headers: dict[str, str]
    body: str  # pretty-printed JSON
    signature_ok: bool
    answered: int


class TesterOut(BaseModel):
    webhook: WebhookOut
    failing: bool
    hits: list[TestHitOut]


class TesterIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    failing: bool


def _key(settings) -> bytes:
    return webhooks.webhook_key(settings.jwt_secret_bytes())


# --- the receiver: our own deliveries call this ---------------------------------------


@router.post("/v1/webhook-tester/{endpoint_id}", include_in_schema=False, dependencies=[Depends(tester_limit)])
async def receive(
    endpoint_id: Annotated[int, Path(gt=0)], request: Request, db: SessionDep, now: NowDep, settings: SettingsDep
):
    body = await limited_body(request, webhook_tester.MAX_BODY, too_big="webhook_test_too_big")
    headers = {name.lower(): value for name, value in request.headers.items()}
    answered = webhook_tester.receive(db, endpoint_id, body, headers, now, _key(settings))
    if answered is None:
        raise HTTPException(404, "webhook_tester_not_found")
    db.commit()
    return Response(status_code=answered)


# --- the admin's view: the demo campus only ---------------------------------------------


def _demo_tester(db, admin, slug: str, settings, now: datetime, lock: bool = False):
    institution = _managed(db, admin, slug, lock=lock)
    if institution.slug != _demo_slug(settings):
        raise HTTPException(404, "webhook_tester_not_found")  # a real campus has its own addresses
    return institution, webhook_tester.ensure_tester(db, institution, settings.public_api_url, now)


def _view(db, endpoint) -> TesterOut:
    return TesterOut(
        webhook=_webhook_out(endpoint),
        failing=endpoint.tester_failing,
        hits=[
            TestHitOut(
                id=hit.id,
                received_at=hit.received_at,
                event_type=hit.event_type,
                event_id=hit.event_id,
                headers=hit.headers,
                body=webhook_tester.pretty(hit.body),
                signature_ok=hit.signature_ok,
                answered=hit.answered,
            )
            for hit in webhook_tester.hits(db, endpoint)
        ],
    )


@router.get("/admin/institutions/{slug}/webhook-tester", response_model=TesterOut)
def get_tester(slug: Slug, admin: AdminDep, db: SessionDep, now: NowDep, settings: SettingsDep):
    _, endpoint = _demo_tester(db, admin, slug, settings, now, lock=True)
    db.commit()  # made the first time
    return _view(db, endpoint)


@router.patch("/admin/institutions/{slug}/webhook-tester", response_model=TesterOut, dependencies=[Depends(write_limit)])
def set_failing(slug: Slug, body: TesterIn, admin: AdminDep, db: SessionDep, now: NowDep, settings: SettingsDep):
    _, endpoint = _demo_tester(db, admin, slug, settings, now, lock=True)
    endpoint.tester_failing = body.failing
    db.commit()
    return _view(db, endpoint)


@router.post(
    "/admin/institutions/{slug}/webhook-tester/send", response_model=DeliveryOut, dependencies=[Depends(write_limit)]
)
def send_sample(
    slug: Slug,
    admin: AdminDep,
    db: SessionDep,
    now: NowDep,
    settings: SettingsDep,
    client: ClientDep,
    resolve: ResolveDep,
):
    """A real delivery, over HTTP, to the receiver above."""
    institution, endpoint = _demo_tester(db, admin, slug, settings, now, lock=True)
    db.commit()  # the receiver, in another request, must see the endpoint
    payload = webhook_tester.sample_payload(db, institution, now)
    delivery = webhooks.send_now(
        db, endpoint, payload, client, _key(settings), now, settings.webhook_allow_private, resolve
    )
    db.commit()
    return _delivery_out(delivery)
