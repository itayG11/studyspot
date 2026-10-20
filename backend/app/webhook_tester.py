"""The demo campus's webhook tester (wave 14.5): a receiver on our own site,
so a visitor sees a real signed delivery arrive, without a server of theirs.

The demo campus has one built-in endpoint pointing here. Deliveries go out
over real HTTP like any institution's, are checked here with the same
verify() a receiver would use, and the last few are shown on the tester.
While "failing" is on, the tester answers 503: the delivery log then shows
a try again, as with a real server that is down.
"""

import json
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import webhooks
from app.models import Institution, Place, WebhookEndpoint, WebhookTestHit

MAX_HITS = 20  # per endpoint
KEEP = timedelta(hours=1)
MAX_BODY = 16_384


def tester_url(public_api_url: str, endpoint_id: int) -> str:
    return f"{public_api_url.rstrip('/')}/v1/webhook-tester/{endpoint_id}"


def tester_of(session: Session, institution: Institution) -> WebhookEndpoint | None:
    return session.scalars(
        select(WebhookEndpoint).where(WebhookEndpoint.institution_id == institution.id, WebhookEndpoint.built_in)
    ).first()


def ensure_tester(session: Session, institution: Institution, public_api_url: str, now: datetime) -> WebhookEndpoint:
    """The built-in endpoint, made the first time it is needed."""
    endpoint = tester_of(session, institution)
    if endpoint is None:
        endpoint = WebhookEndpoint(
            institution_id=institution.id,
            url="",  # its own id goes into the address: set just below
            events=list(webhooks.EVENTS),
            active=True,
            built_in=True,
            created_at=now,
        )
        session.add(endpoint)
        session.flush()
    url = tester_url(public_api_url, endpoint.id)
    if endpoint.url != url:  # the site's address changed (a new domain)
        endpoint.url = url
    return endpoint


def receive(
    session: Session, endpoint_id: int, body: bytes, headers: dict[str, str], now: datetime, key: bytes
) -> int | None:
    """What the tester answers (200 or 503), or None: not a tester."""
    endpoint = session.get(WebhookEndpoint, endpoint_id)
    if endpoint is None or not endpoint.built_in:
        return None
    signature = headers.get("studyspot-signature", "")
    ok = webhooks.verify(webhooks.secret_for(key, endpoint), signature, body, now)
    answered = 503 if endpoint.tester_failing else 200
    session.add(
        WebhookTestHit(
            endpoint_id=endpoint.id,
            received_at=now,
            event_type=headers.get("studyspot-event", "")[:32] or None,
            event_id=headers.get("studyspot-delivery", "")[:40] or None,
            headers={k: v[:200] for k, v in headers.items() if k.startswith("studyspot-") or k == "content-type"},
            body=body[:MAX_BODY].decode("utf-8", errors="replace"),
            signature_ok=ok,
            answered=answered,
        )
    )
    session.flush()
    # Only the last few: older ones go at once, not only in the sweep.
    keep = select(WebhookTestHit.id).where(WebhookTestHit.endpoint_id == endpoint.id).order_by(
        WebhookTestHit.id.desc()
    ).limit(MAX_HITS)
    session.execute(
        delete(WebhookTestHit).where(WebhookTestHit.endpoint_id == endpoint.id, WebhookTestHit.id.not_in(keep))
    )
    return answered


def hits(session: Session, endpoint: WebhookEndpoint) -> list[WebhookTestHit]:
    return list(
        session.scalars(
            select(WebhookTestHit).where(WebhookTestHit.endpoint_id == endpoint.id).order_by(WebhookTestHit.id.desc())
        )
    )


def sample_payload(session: Session, institution: Institution, now: datetime) -> dict[str, Any]:
    """A checkin.started for one of the campus's places, as a real one would be."""
    place_id = session.scalar(
        select(Place.id).where(Place.institution_id == institution.id).order_by(Place.id).limit(1)
    )
    payload = webhooks.test_payload(now)
    payload["type"] = "checkin.started"
    payload["data"] = webhooks._place_data(session, place_id, now) if place_id else {}
    return payload


def pretty(body: str) -> str:
    try:
        return json.dumps(json.loads(body), ensure_ascii=False, indent=2)
    except ValueError:
        return body


def delete_old(session: Session, now: datetime) -> int:
    return session.execute(delete(WebhookTestHit).where(WebhookTestHit.received_at < now - KEEP)).rowcount
