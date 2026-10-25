"""The demo campus's admin is anyone: whoever presses "sign in as the demo
admin". A real person can be in that campus too (a Google account of no
institution joins it, app/accounts.py), so nothing the admin can read may
name them: not their name, not their e-mail, not their bookings.

The test walks every GET route an admin may call (the table in
test_access_matrix.py), so a route added later is checked as well.
"""

from datetime import timedelta

from conftest import SUNDAY_10AM
from sqlalchemy import select
from test_access_matrix import ACCESS, fill
from test_demo_login import demo, demo_client, demo_login, make_client  # noqa: F401 (fixtures)

from app import webhooks
from app.models import Booking, BookingSource, BookingStatus, Place, User, WebhookEndpoint

NAME = "Real Person Zzyzx"
EMAIL = "real.person.zzyzx@gmail.example"


def test_the_demo_admin_reads_nothing_that_names_a_real_person(demo_client, session, demo):  # noqa: F811
    person = User(institution_id=demo.id, email=EMAIL, display_name=NAME)
    session.add(person)
    session.flush()
    place = session.scalars(select(Place).where(Place.institution_id == demo.id)).first()
    booking = Booking(user_id=person.id, institution_id=demo.id, place_id=place.id,
                      starts_at=SUNDAY_10AM + timedelta(days=1), ends_at=SUNDAY_10AM + timedelta(days=1, hours=1),
                      source=BookingSource.ADVANCE, status=BookingStatus.BOOKED)
    session.add(booking)
    session.flush()
    # The booking's webhook too: its delivery is shown in the admin's log.
    webhooks.booking_event(session, "booking.created", booking, SUNDAY_10AM)

    token = demo_login(demo_client, "admin").json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    endpoints = session.scalars(select(WebhookEndpoint.id).where(WebhookEndpoint.institution_id == demo.id)).all()
    ids = {"slug": demo.slug, "place_id": place.id}

    read = 0
    for (method, path), kind in sorted(ACCESS.items()):
        if method != "GET" or kind != "admin":
            continue
        for endpoint_id in endpoints if "{endpoint_id}" in path else [None]:
            address = fill(path, {**ids, "endpoint_id": endpoint_id})
            assert "{" not in address, f"no id here for {path}"
            response = demo_client.get(address, headers=headers)
            assert response.status_code in (200, 403, 404), (address, response.status_code)
            text = response.text.lower()
            assert NAME.lower() not in text and EMAIL not in text and "zzyzx" not in text, address
            read += response.status_code == 200
    assert read >= 5  # most of them answered: the check read real pages, not refusals
