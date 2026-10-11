"""Adding and removing a student's classes (models/classes.py)."""

from datetime import time

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import Refusal
from app.models import Building, ClassSlot, User

# A full week of classes is far below this; it keeps one account small.
MAX_CLASSES = 40

# The week as the site shows it: Sunday first (Python's numbering).
WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5]


def week_key(row: ClassSlot) -> tuple[int, time]:
    return WEEK_ORDER.index(row.weekday), row.starts


def list_classes(db: Session, user: User) -> list[ClassSlot]:
    return sorted(db.scalars(select(ClassSlot).where(ClassSlot.user_id == user.id)).all(), key=week_key)


def add_class(
    db: Session, user: User, weekday: int, starts: time, ends: time, building_code: str, title: str | None
) -> ClassSlot:
    # Locked: two tabs adding at once cannot both pass the checks below.
    db.refresh(user, with_for_update=True)
    building = db.scalars(
        select(Building).where(Building.institution_id == user.institution_id, Building.code == building_code)
    ).first()
    if building is None:
        raise Refusal(404, "building_not_found")
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
    row = ClassSlot(user_id=user.id, weekday=weekday, starts=starts, ends=ends, building_id=building.id, title=title)
    db.add(row)
    db.flush()
    return row


def remove_class(db: Session, user: User, class_id: int) -> None:
    row = db.get(ClassSlot, class_id)
    if row is None or row.user_id != user.id:
        raise Refusal(404, "class_not_found")  # someone else's says the same: nothing to learn
    db.delete(row)
    db.flush()
