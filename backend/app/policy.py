"""What an institution has switched on of wave 19 (someone stays after their time).

Three levels (app/models/campus.py OverstayPolicy): none, reminders (the
default), reports. These small functions are the one place that says what each
level means, so the hint, the break, the reminder and the report all read
the same answer.
"""

from app.models import Institution, OverstayPolicy


def effective_grace(institution: Institution) -> int:
    """Minutes a ran-out room or seat is shown as "maybe still taken": none when it is all off."""
    return 0 if institution.overstay_policy == OverstayPolicy.NONE else institution.grace_minutes


def effective_break(institution: Institution) -> int:
    """Minutes a break holds the place: none when it is all off."""
    return 0 if institution.overstay_policy == OverstayPolicy.NONE else institution.break_minutes


def reminds(institution: Institution) -> bool:
    """The "your time ends soon" reminder."""
    return institution.overstay_policy != OverstayPolicy.NONE


def takes_reports(institution: Institution) -> bool:
    """Students can report a taken place, and the institution reads them."""
    return institution.overstay_policy == OverstayPolicy.REPORTS
