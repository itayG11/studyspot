"""A sample week of classes for the demo campus's shared student, so a
visitor sees "a place between classes" at once, without typing a timetable.

Every visitor signs in as the same demo student, so edits are shared; the
daily demo reset (app/campus_admin.py) puts this sample back."""

from datetime import time

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import AuthProvider, Building, ClassSlot, Institution, User, UserIdentity

# (weekday in Python's numbering, starts, ends, building, course). Made up,
# with gaps of different lengths on purpose.
SAMPLE = [
    (6, time(8, 30), time(10), "M", "מבוא למדעי המחשב"),
    (6, time(11), time(12, 30), "EF", "מתמטיקה בדידה"),
    (6, time(14), time(15, 30), "EM", "מבני נתונים"),
    (0, time(9), time(10, 30), "L", "פיזיקה 1"),
    (0, time(12), time(13, 30), "M", "תכנות מונחה עצמים"),
    (1, time(10), time(11, 30), "EF", "אלגברה לינארית"),
    (1, time(13), time(14, 30), "P", "מערכות ספרתיות"),
    (2, time(8, 30), time(10), "EM", "מערכות הפעלה"),
    (2, time(11), time(12, 30), "M", "רשתות תקשורת"),
    (3, time(10), time(11, 30), "L", "הסתברות"),
    (3, time(12, 30), time(14), "EF", "הנדסת תוכנה"),
]


def give_sample_timetable(db: Session, user: User) -> None:
    """Replaces the user's classes with the sample, for the buildings this
    campus has."""
    buildings = {
        b.code: b.id for b in db.scalars(select(Building).where(Building.institution_id == user.institution_id))
    }
    db.execute(delete(ClassSlot).where(ClassSlot.user_id == user.id))
    db.add_all(
        ClassSlot(user_id=user.id, weekday=day, starts=starts, ends=ends, building_id=buildings[code], title=title)
        for day, starts, ends, code, title in SAMPLE
        if code in buildings
    )
    db.flush()


def demo_student(db: Session, institution: Institution) -> User | None:
    link = db.scalars(
        select(UserIdentity).where(
            UserIdentity.provider == AuthProvider.DEMO, UserIdentity.subject == f"{institution.slug}:student"
        )
    ).first()
    return db.get(User, link.user_id) if link else None
