"""The signed-in student's timetable, and the places it suggests between
classes. Only the owner reads or changes it."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy.orm import Session

from app import classes
from app.api.deps import get_session
from app.auth import get_current_user
from app.errors import Refusal
from app.models import ClassSlot, User
from app.ratelimit import write_limit
from app.schemas import ClassSlotIn, ClassSlotOut

router = APIRouter(tags=["classes"])

SessionDep = Annotated[Session, Depends(get_session)]
UserDep = Annotated[User, Depends(get_current_user)]


def _out(row: ClassSlot) -> ClassSlotOut:
    return ClassSlotOut(
        id=row.id, weekday=row.weekday, starts=row.starts, ends=row.ends,
        building_code=row.building.code, title=row.title,
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
        row = classes.add_class(db, user, body.weekday, body.starts, body.ends, body.building_code, body.title)
    except Refusal as refusal:
        raise HTTPException(refusal.status, refusal.code) from None
    db.commit()
    return _out(row)


@router.delete(
    "/me/classes/{class_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(write_limit)]
)
def remove_class(class_id: Annotated[int, Path(gt=0)], user: UserDep, db: SessionDep) -> None:
    try:
        classes.remove_class(db, user, class_id)
    except Refusal as refusal:
        raise HTTPException(refusal.status, refusal.code) from None
    db.commit()
