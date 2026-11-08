"""The institution's side of wave 19: what is on, the reports, and when they come.

Every route needs an admin of the institution (another one gets a 404). The
answers hold places and times, never the one who reported or the one who stayed.
"""

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.admin import AdminDep, SessionDep, SettingsDep, _demo_slug, _managed, _refuse_demo
from app.clock import get_now
from app.models import Building, Institution, OccupancyReport, Place, ReportResolution, ReportStatus, Seat
from app.overstay import heat, open_count
from app.permissions import can_manage
from app.ratelimit import write_limit
from app.schemas import HeatOut, OverstayOut, OverstayPatchIn, ReportItemOut, ResolveIn

router = APIRouter(prefix="/admin", tags=["overstay"])

NowDep = Annotated[datetime, Depends(get_now)]
Slug = Annotated[str, Path(max_length=64)]
MAX_LIST = 200


def _settings_out(session: Session, institution, settings) -> OverstayOut:
    return OverstayOut(
        policy=institution.overstay_policy,
        grace_minutes=institution.grace_minutes,
        break_minutes=institution.break_minutes,
        locked=institution.slug == _demo_slug(settings),
        open_reports=open_count(session, institution),
    )


@router.get("/institutions/{slug}/overstay", response_model=OverstayOut)
def get_overstay(slug: Slug, admin: AdminDep, db: SessionDep, settings: SettingsDep):
    return _settings_out(db, _managed(db, admin, slug), settings)


@router.patch("/institutions/{slug}/overstay", response_model=OverstayOut, dependencies=[Depends(write_limit)])
def patch_overstay(slug: Slug, body: OverstayPatchIn, admin: AdminDep, db: SessionDep, settings: SettingsDep):
    institution = _managed(db, admin, slug, lock=True)
    _refuse_demo(institution, settings)
    for field, value in body.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(institution, "overstay_policy" if field == "policy" else field, value)
    db.commit()
    return _settings_out(db, institution, settings)


@router.get("/institutions/{slug}/reports", response_model=list[ReportItemOut])
def list_reports(
    slug: Slug, admin: AdminDep, db: SessionDep, status: Annotated[Literal["open", "resolved"], Query()] = "open"
):
    institution = _managed(db, admin, slug)
    rows = db.execute(
        select(OccupancyReport, Place.name, Building.code, Seat.label)
        .join(Place, Place.id == OccupancyReport.place_id)
        .join(Building, Building.id == Place.building_id)
        .outerjoin(Seat, Seat.id == OccupancyReport.seat_id)
        .where(OccupancyReport.institution_id == institution.id, OccupancyReport.status == ReportStatus(status))
        .order_by(OccupancyReport.created_at.desc(), OccupancyReport.id.desc())
        .limit(MAX_LIST)
    ).all()
    return [
        ReportItemOut(
            id=r.id, place_id=r.place_id, place_name=name, building_code=code, seat_label=label,
            created_at=r.created_at, status=r.status.value, resolution=r.resolution.value if r.resolution else None,
        )
        for r, name, code, label in rows
    ]


@router.post("/reports/{report_id}/resolve", response_model=ReportItemOut, dependencies=[Depends(write_limit)])
def resolve_report(report_id: Annotated[int, Path(gt=0)], body: ResolveIn, admin: AdminDep, db: SessionDep, now: NowDep):
    report = db.scalars(select(OccupancyReport).where(OccupancyReport.id == report_id).with_for_update()).first()
    institution = db.get(Institution, report.institution_id) if report else None
    if report is None or not can_manage(admin, institution):
        raise HTTPException(404, "report_not_found")
    if report.status == ReportStatus.RESOLVED:
        raise HTTPException(409, "report_already_closed")
    report.status, report.resolution, report.resolved_at = ReportStatus.RESOLVED, ReportResolution(body.resolution), now
    db.commit()
    place = db.get(Place, report.place_id)
    seat = db.get(Seat, report.seat_id) if report.seat_id else None
    return ReportItemOut(
        id=report.id, place_id=place.id, place_name=place.name, building_code=place.building.code,
        seat_label=seat.label if seat else None, created_at=report.created_at, status="resolved",
        resolution=report.resolution.value,
    )


@router.get("/institutions/{slug}/reports/heat", response_model=HeatOut)
def get_heat(slug: Slug, admin: AdminDep, db: SessionDep, now: NowDep, days: Annotated[int, Query(ge=1, le=365)] = 30):
    institution = _managed(db, admin, slug)
    cells, advice = heat(db, institution, now, days)
    return HeatOut(days=days, cells=cells, recommendations=advice)
