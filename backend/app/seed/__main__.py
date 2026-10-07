"""Load the Braude demo data into the development database.

Usage (from backend/, after `alembic upgrade head`):  python -m app.seed
"""

from sqlalchemy import func, select

from app.db import SessionLocal, get_engine
from app.models import Building, Place, Seat
from app.seed import seed_braude


def main() -> None:
    with SessionLocal(bind=get_engine()) as session:
        institution = seed_braude(session)
        session.commit()
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
