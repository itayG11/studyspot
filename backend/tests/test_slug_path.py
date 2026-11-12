"""An institution's address in a path is checked the same way on every route
(letters, digits and single dashes, as the table's slug_format), so a value with
a line break never gets as far as a query or a log line."""

import pytest
from factories import make_institution

from app.models import User, UserRole

BAD_ADDRESSES = ["bad%0Aslug", "Bad", "-lead", "two--dashes", "has%20space"]

ROUTES = [
    ("post", "/system/institutions/{slug}/close"),
    ("post", "/system/institutions/{slug}/reopen"),
    ("get", "/system/institutions/{slug}/invites"),
    ("get", "/admin/institutions/{slug}/overstay"),
    ("patch", "/admin/institutions/{slug}/overstay"),
    ("get", "/admin/institutions/{slug}/reports"),
    ("get", "/admin/institutions/{slug}/reports/heat"),
    ("get", "/admin/institutions/{slug}/api-keys"),
    ("get", "/admin/institutions/{slug}/webhooks"),
    ("get", "/admin/institutions/{slug}/webhook-tester"),
]


@pytest.fixture
def owner(session):
    ops = make_institution(session, "ops")
    user = User(institution_id=ops.id, email="owner@gmail.com", display_name="Owner", role=UserRole.SYSTEM_ADMIN)
    session.add(user)
    session.flush()
    return user


@pytest.mark.parametrize("slug", BAD_ADDRESSES)
@pytest.mark.parametrize(("method", "path"), ROUTES)
def test_a_malformed_address_is_refused_before_anything_else(client, owner, method, path, slug):
    client.user = owner
    response = getattr(client, method)(path.format(slug=slug))
    assert response.status_code == 422, (method, path, slug, response.text)
