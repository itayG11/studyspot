"""Load the campus data: Braude, and the demo campus the live site shows.

Usage (from backend/, after `alembic upgrade head`):  python -m app.seed
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import SessionLocal, get_engine
from app.models import Building, Institution, Place, Seat
from app.seed import seed_braude, seed_demo


def main() -> None:
    with SessionLocal(bind=get_engine()) as session:
        for seed in (seed_braude, seed_demo):
            institution = seed(session)
            session.commit()
            report(session, institution)


def report(session: Session, institution: Institution) -> None:
    buildings = session.scalar(
        select(func.count()).select_from(Building).where(Building.institution_id == institution.id)
    )
    places = session.scalar(
        select(func.count()).select_from(Place).where(Place.institution_id == institution.id)
    )
    seats = session.scalar(
        select(func.count()).select_from(Seat).join(Place).where(Place.institution_id == institution.id)
    )
    print(f"{institution.slug}: {buildings} buildings, {places} places, {seats} lab seats")


if __name__ == "__main__":
    main()
