"""The signed-in student's timetable, and the places it suggests between
classes. Only the owner reads or changes it."""

from dataclasses import asdict
from datetime import datetime
from typing import Annotated

import anyio
from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app import classes, timetable_import, timetable_photo
from app.api.deps import get_session, limited_body
from app.auth import get_current_user
from app.between_classes import suggest
from app.clock import get_now
from app.config import Settings, get_settings
from app.errors import Refusal
from app.models import Building, ClassSlot, User
from app.ratelimit import between_limit, import_limit, photo_day, photo_minute, photo_site, write_limit
from app.schemas import BetweenClassesOut, BulkResultOut, ClassSlotIn, ClassSlotOut, GapOut, ImportRowOut, SuggestionOut

router = APIRouter(tags=["classes"])

SessionDep = Annotated[Session, Depends(get_session)]
UserDep = Annotated[User, Depends(get_current_user)]
NowDep = Annotated[datetime, Depends(get_now)]


def _out(row: ClassSlot) -> ClassSlotOut:
    return ClassSlotOut(
        id=row.id, weekday=row.weekday, starts=row.starts, ends=row.ends,
        building_code=row.building.code if row.building else None, place_text=row.place_text, title=row.title,
    )


@router.get("/me/classes", response_model=list[ClassSlotOut])
def my_classes(user: UserDep, db: SessionDep):
    return [_out(row) for row in classes.list_classes(db, user)]


@router.post(
    "/me/classes", status_code=status.HTTP_201_CREATED, response_model=ClassSlotOut,
    dependencies=[Depends(write_limit)],
)
def add_class(body: ClassSlotIn, user: UserDep, db: SessionDep):
    try:
        row = classes.add_class(
            db, user, body.weekday, body.starts, body.ends, body.building_code, body.title, body.place_text
        )
    except Refusal as refusal:
        raise HTTPException(refusal.status, refusal.code) from None
    db.commit()
    return _out(row)


@router.delete("/me/classes", dependencies=[Depends(write_limit)])
def remove_all_classes(user: UserDep, db: SessionDep) -> dict[str, int]:
    """The whole timetable at once (the site asks first)."""
    removed = classes.remove_all(db, user)
    db.commit()
    return {"removed": removed}


@router.delete(
    "/me/classes/{class_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(write_limit)]
)
def remove_class(class_id: Annotated[int, Path(gt=0)], user: UserDep, db: SessionDep) -> None:
    try:
        classes.remove_class(db, user, class_id)
    except Refusal as refusal:
        raise HTTPException(refusal.status, refusal.code) from None
    db.commit()


@router.post(
    "/me/classes/bulk", response_model=list[BulkResultOut], dependencies=[Depends(write_limit)],
)
def add_classes(body: Annotated[list[ClassSlotIn], Field(min_length=1, max_length=classes.MAX_CLASSES)], user: UserDep, db: SessionDep):
    """Several classes at once (an imported timetable): each through the same
    checks as one, in order, and each answer said; one write for the limit."""
    results = []
    for item in body:
        try:
            with db.begin_nested():
                classes.add_class(
                    db, user, item.weekday, item.starts, item.ends, item.building_code, item.title, item.place_text
                )
            results.append(BulkResultOut(refused=None))
        except Refusal as refusal:
            results.append(BulkResultOut(refused=refusal.code))
    db.commit()
    return results


@router.post("/me/classes/import", response_model=list[ImportRowOut], dependencies=[Depends(import_limit)])
async def preview_import(request: Request, user: UserDep, db: SessionDep):
    """A timetable exported from the college, sent as the request body: what
    it holds, for the student to check and add. Nothing is saved, and the
    file is not kept (app/timetable_import.py)."""
    data = await limited_body(request, timetable_import.MAX_BYTES)
    buildings = await run_in_threadpool(
        lambda: db.scalars(select(Building).where(Building.institution_id == user.institution_id)).all()
    )
    try:
        rows = await run_in_threadpool(timetable_import.read_yedion, data, list(buildings))
    except timetable_import.ImportRefused as refused:
        raise HTTPException(422, refused.code) from None
    return [ImportRowOut(**asdict(row)) for row in rows]


def get_photo_reader(settings: Annotated[Settings, Depends(get_settings)]) -> timetable_photo.Ask | None:
    """The photo reader, or None when no Anthropic key is set (tests replace it)."""
    key = settings.anthropic_api_key
    return timetable_photo.claude_reader(key.get_secret_value()) if key is not None else None


ReaderDep = Annotated[timetable_photo.Ask | None, Depends(get_photo_reader)]

# A reading can take half a minute: at most this many at once, on their own
# threads, so slow photos never hold the threads every other request needs.
PHOTO_AT_ONCE = anyio.CapacityLimiter(3)


def photo_on(reader: ReaderDep) -> None:
    """First of all: no key, no photo reading (and no try counted)."""
    if reader is None:
        raise HTTPException(404, "import_photo_off")


@router.get("/me/classes/import-options")
def import_options(user: UserDep, reader: ReaderDep) -> dict[str, bool]:
    """Which ways in the site offers: the file always, a photo with a key."""
    return {"photo": reader is not None}


@router.post(
    "/me/classes/import-photo", response_model=list[ImportRowOut],
    dependencies=[Depends(photo_on), Depends(photo_minute), Depends(photo_day), Depends(photo_site)],
)
async def preview_photo(request: Request, user: UserDep, db: SessionDep, reader: ReaderDep):
    """A photo of the timetable, read by Claude: what it holds, for the
    student to check and add. Nothing saved, the image not kept here."""
    data = await limited_body(request, timetable_photo.MAX_BYTES, too_big="import_photo_too_big")
    try:
        timetable_photo.media_type(data)  # not an image: refused before the buildings, and the paid call
        buildings = await run_in_threadpool(
            lambda: db.scalars(select(Building).where(Building.institution_id == user.institution_id)).all()
        )
        rows = await anyio.to_thread.run_sync(
            timetable_photo.read_photo, data, list(buildings), reader, limiter=PHOTO_AT_ONCE
        )
    except timetable_import.ImportRefused as refused:
        code = "import_photo_too_big" if refused.code == "import_too_big" else refused.code
        raise HTTPException(422, code) from None
    except timetable_photo.PhotoUnavailable:
        raise HTTPException(503, "import_photo_unavailable") from None
    return [ImportRowOut(**asdict(row)) for row in rows]


@router.get("/me/between-classes", response_model=BetweenClassesOut, dependencies=[Depends(between_limit)])
def between_classes(
    user: UserDep, db: SessionDep, now: NowDep, weekday: Annotated[int | None, Query(ge=0, le=6)] = None
):
    """The gaps between the student's classes, today or on another weekday,
    each with up to three places to study, and the numbers behind each one."""
    result = suggest(db, user, now, weekday)
    return BetweenClassesOut(
        weekday=result.weekday,
        date=result.date,
        gaps=[
            GapOut(
                starts=g.starts, ends=g.ends, from_building=g.from_building, to_building=g.to_building, now=g.now,
                from_listed=g.from_listed, to_listed=g.to_listed,
                suggestions=[SuggestionOut(**asdict(s)) for s in g.suggestions],
            )
            for g in result.gaps
        ],
    )

