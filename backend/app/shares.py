""""I'm studying here" (wave 14): a link a student sends a friend, which
stops working by itself when the check-in or the booking ends.

A link looks like  /s/c42.n1.<signature>  where c42 is check-in 42 (b17 is
booking 17), n1 means "show my name" (n0: don't), and the signature is
HMAC-SHA256 over both, so nobody can change the number or turn the name on.

Nothing is stored. Every time the link is opened the server reads the
check-in or booking itself and answers only while it is still active, so
the link "expires" exactly when the stay does: when the student leaves,
when the check-in runs out, or when the booking ends or is cancelled. A
later stay has a new number, so an old link never comes back to life.
"""

import base64
import hashlib
import hmac
import re
from dataclasses import dataclass
from datetime import datetime
from html import escape
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.bookings import holding
from app.models import Booking, BookingStatus, Building, CheckIn, Institution, Place, User
from app.occupancy import is_active

_TOKEN = re.compile(r"([cb])([1-9][0-9]{0,11})\.n([01])\.([A-Za-z0-9_-]{43})")
CHECK_IN, BOOKING = "c", "b"


def share_key(jwt_secret: bytes) -> bytes:
    """Its own key, made from the server's secret: a share signature can
    never pass for a check-in code or a sign-in token."""
    return hmac.new(jwt_secret, b"studyspot study shares", hashlib.sha256).digest()


def _signature(key: bytes, kind: str, row_id: int, named: bool) -> str:
    message = f"studyspot-share:{kind}:{row_id}:{int(named)}".encode()
    return base64.urlsafe_b64encode(hmac.new(key, message, hashlib.sha256).digest()).rstrip(b"=").decode()


def make_token(key: bytes, kind: str, row_id: int, named: bool) -> str:
    return f"{kind}{row_id}.n{int(named)}.{_signature(key, kind, row_id, named)}"


@dataclass(frozen=True)
class Claim:
    kind: str
    row_id: int
    named: bool


def read_token(key: bytes, text: str) -> Claim | None:
    match = _TOKEN.fullmatch(text)
    if match is None:
        return None
    kind, row_id, named = match[1], int(match[2]), match[3] == "1"
    if not hmac.compare_digest(match[4], _signature(key, kind, row_id, named)):
        return None
    return Claim(kind, row_id, named)


@dataclass(frozen=True)
class ShareView:
    """What a friend sees: never the email or the user's id."""

    name: str | None
    here_now: bool  # False: a booking that has not started yet
    starts_at: datetime
    until: datetime
    place_id: int
    place_name: str
    building_code: str
    building_name: str | None
    slug: str
    timezone: str


def view_for(session: Session, token: str, now: datetime, key: bytes) -> ShareView | None:
    """None for a forged link, or for a stay that is over."""
    claim = read_token(key, token)
    if claim is None:
        return None
    columns = (Place, Building, Institution, User)
    if claim.kind == CHECK_IN:
        found = session.execute(
            select(CheckIn, *columns)
            .join(Place, Place.id == CheckIn.place_id)
            .join(User, User.id == CheckIn.user_id)
            .where(CheckIn.id == claim.row_id, is_active(now))
            .join(Building, Building.id == Place.building_id)
            .join(Institution, Institution.id == Place.institution_id)
        ).first()
        if found is None:
            return None
        stay, place, building, institution, user = found
        starts_at, until, here_now = stay.started_at, stay.expires_at, True
    else:
        found = session.execute(
            select(Booking, *columns)
            .join(Place, Place.id == Booking.place_id)
            .join(User, User.id == Booking.user_id)
            .where(Booking.id == claim.row_id, holding(now), Booking.ends_at > now)
            .join(Building, Building.id == Place.building_id)
            .join(Institution, Institution.id == Place.institution_id)
        ).first()
        if found is None:
            return None
        stay, place, building, institution, user = found
        starts_at, until = stay.starts_at, stay.ends_at
        here_now = stay.status is BookingStatus.CHECKED_IN  # booked, not arrived: not here yet
    return ShareView(
        name=user.display_name if claim.named else None,
        here_now=here_now,
        starts_at=starts_at,
        until=until,
        place_id=place.id,
        place_name=place.name,
        building_code=building.code,
        building_name=building.name,
        slug=institution.slug,
        timezone=institution.timezone,
    )


def owned_stay(session: Session, user: User, kind: str, row_id: int, now: datetime) -> bool:
    """Only the student's own stay that is active right now can be shared."""
    if kind == CHECK_IN:
        query = select(CheckIn.id).where(CheckIn.id == row_id, CheckIn.user_id == user.id, is_active(now))
    else:
        query = select(Booking.id).where(
            Booking.id == row_id, Booking.user_id == user.id, holding(now), Booking.ends_at > now
        )
    return session.scalar(query) is not None


# --- the preview a chat app shows ---------------------------------------------------
# WhatsApp and Telegram do not run the page's scripts: they read the og: tags
# from the HTML the server sends. So /s/<token> gets the web app's index.html
# with these tags rewritten for this stay; the page itself is still the web app.


def _clock(moment: datetime, timezone: str) -> str:
    return moment.astimezone(ZoneInfo(timezone)).strftime("%H:%M")


def in_place(name: str) -> str:
    """ "בספרייה", but "ב-M206": Hebrew joins the letter, anything else takes a hyphen."""
    return f"ב{name}" if name[:1] and "\u0590" <= name[0] <= "\u05ff" else f"ב-{name}"


def preview_text(view: ShareView | None) -> tuple[str, str]:
    """The title and the description of the preview."""
    if view is None:
        return "הקישור כבר לא פעיל", "השהות הזו הסתיימה. ב-StudySpot רואים מה פנוי עכשיו בקמפוס."
    who = f"{view.name} " if view.name else ""
    until = _clock(view.until, view.timezone)
    if view.here_now:
        title = f"{who}לומד/ת עכשיו {in_place(view.place_name)}"
    else:
        title = f"{who}ילמד/תלמד {in_place(view.place_name)} מ-{_clock(view.starts_at, view.timezone)}"
    building = f"{view.building_name}, {view.building_code}" if view.building_name else view.building_code
    return title, f"בניין {building}. עד {until}."


_META = {
    "title": re.compile(r"<title>[^<]*</title>"),
    "og:title": re.compile(r'(<meta property="og:title" content=")[^"]*(")'),
    "og:description": re.compile(r'(<meta property="og:description" content=")[^"]*(")'),
    "description": re.compile(r'(<meta name="description" content=")[^"]*(")'),
}


def preview_html(index_html: str, view: ShareView | None) -> str:
    """index.html with this stay's title. Everything put in is escaped: a
    display name like  "><script>  stays text."""
    title, description = (escape(part, quote=True) for part in preview_text(view))
    page = _META["title"].sub(lambda _: f"<title>{title}</title>", index_html, count=1)
    page = _META["og:title"].sub(lambda m: f"{m[1]}{title}{m[2]}", page, count=1)
    page = _META["og:description"].sub(lambda m: f"{m[1]}{description}{m[2]}", page, count=1)
    page = _META["description"].sub(lambda m: f"{m[1]}{description}{m[2]}", page, count=1)
    return page.replace("<head>", '<head>\n    <meta name="robots" content="noindex" />', 1)
