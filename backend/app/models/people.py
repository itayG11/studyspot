"""Users. Kept minimal here; stage 5 adds sign-in details and roles."""

from sqlalchemy import CheckConstraint, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email"),
        # Target of the composite foreign key from check_ins.
        UniqueConstraint("id", "institution_id"),
        CheckConstraint("email = lower(email)", name="email_lowercase"),
        CheckConstraint("btrim(display_name) <> ''", name="display_name_not_blank"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    institution_id: Mapped[int] = mapped_column(
        ForeignKey("institutions.id", ondelete="CASCADE"), index=True
    )
    email: Mapped[str] = mapped_column(String(320))
    display_name: Mapped[str] = mapped_column(String(100))
