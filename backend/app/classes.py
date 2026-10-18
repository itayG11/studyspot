"""Adding and removing a student's classes (models/classes.py)."""

from collections.abc import Iterable
from datetime import time

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.errors import Refusal
from app.models import AuthProvider, Building, BuildingStatus, ClassSlot, User, UserIdentity

# A full week of classes is far below this; it keeps one account small.
MAX_CLASSES = 40

# The week as the site shows it: Sunday first (Python's numbering).
WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5]


def week_key(row: ClassSlot) -> tuple[int, time]:
    return WEEK_ORDER.index(row.weekday), row.starts


def list_classes(db: Session, user: User) -> list[ClassSlot]:
    return sorted(db.scalars(select(ClassSlot).where(ClassSlot.user_id == user.id)).all(), key=week_key)


# What the shared demo student keeps for a place typed in words.
SHARED_PLACE = "מקום אחר"


def add_class(
    db: Session, user: User, weekday: int, starts: time, ends: time, building_code: str | None, title: str | None,
    place_text: str | None = None,
) -> ClassSlot:
    """In a building of the campus (building_code), or in a place it does
    not list yet, named in words (place_text)."""
    # Locked: two tabs adding at once cannot both pass the checks below.
    db.refresh(user, with_for_update=True)
    building = None
    if building_code is not None:
        building = db.scalars(
            select(Building).where(
                Building.institution_id == user.institution_id,
                Building.code == building_code,
                Building.status != BuildingStatus.UNDER_CONSTRUCTION,  # no classes there yet
            )
        ).first()
        if building is None:
            raise Refusal(404, "building_not_found")
    elif place_text is not None:
        # Typed, but a building the campus lists ("m", "ספרייה"): that one.
        building = listed_building(db, user.institution_id, place_text)
        if building is not None:
            place_text = None
    count = db.scalar(select(func.count()).select_from(ClassSlot).where(ClassSlot.user_id == user.id))
    if count >= MAX_CLASSES:
        raise Refusal(409, "class_limit")
    overlap = db.scalars(
        select(ClassSlot.id).where(
            ClassSlot.user_id == user.id, ClassSlot.weekday == weekday, ClassSlot.starts < ends, ClassSlot.ends > starts
        )
    ).first()
    if overlap is not None:
        raise Refusal(409, "class_overlaps")
    if (title is not None or place_text is not None) and _shared_demo(db, user):
        # Every visitor is this one student: words typed by one would be
        # shown to all. Only the sample's own course names are kept.
        from app.seed.timetable import SAMPLE

        title = title if title in {t for *_, t in SAMPLE} else None
        place_text = SHARED_PLACE if place_text is not None else None
    row = ClassSlot(
        user_id=user.id, weekday=weekday, starts=starts, ends=ends,
        building_id=building.id if building else None, place_text=place_text, title=title,
    )
    db.add(row)
    db.flush()
    return row


def same_place(text: str) -> str:
    """How two names of a place are compared: case and spacing aside."""
    return " ".join(text.split()).lower()


def match_building[B](text: str, buildings: Iterable[B]) -> B | None:
    """The building the text names: its short name or its full name, case
    and spacing aside. The one rule of the manual form and the three
    imports (wave 7.5); each import only decides which words to ask about."""
    key = same_place(text)
    if not key:
        return None
    return next((b for b in buildings if key in {same_place(n) for n in (b.code, b.name) if n}), None)


def listed_building(db: Session, institution_id: int, text: str) -> Building | None:
    return match_building(
        text,
        db.scalars(
            select(Building).where(
                Building.institution_id == institution_id, Building.status != BuildingStatus.UNDER_CONSTRUCTION
            )
        ),
    )


def remove_all(db: Session, user: User) -> int:
    """The whole timetable at once; how many classes went. The shared demo
    student gets the sample back instead: every visitor is that student."""
    removed = db.execute(delete(ClassSlot).where(ClassSlot.user_id == user.id)).rowcount
    if _shared_demo(db, user):
        from app.seed.timetable import give_sample_timetable

        give_sample_timetable(db, user)
    db.flush()
    return removed


def remove_class(db: Session, user: User, class_id: int) -> None:
    row = db.get(ClassSlot, class_id)
    if row is None or row.user_id != user.id:
        raise Refusal(404, "class_not_found")  # someone else's says the same: nothing to learn
    db.delete(row)
    db.flush()


def _shared_demo(db: Session, user: User) -> bool:
    return db.scalars(
        select(UserIdentity.id).where(UserIdentity.user_id == user.id, UserIdentity.provider == AuthProvider.DEMO)
    ).first() is not None

