"""Braude College campus data, as collected in docs/CAMPUS_DATA.md (stage 1).

Collected from the field by Itay. Room numbers are demo values that follow
the rule "floor 0 = rooms 1xx, floor 1 = rooms 2xx"; they are not the real
room numbers. The exam period dates are invented and marked as demo.
"""

from datetime import date, time

SUNDAY_TO_THURSDAY = (6, 0, 1, 2, 3)  # Python weekday(): Monday is 0, Sunday is 6
FRIDAY = 4

WEEK = {day: (time(7), time(20)) for day in SUNDAY_TO_THURSDAY}
WEEK_AND_FRIDAY = {**WEEK, FRIDAY: (time(7), time(14))}

EXAM_PERIOD = "exam-period"  # tag used below to mark places open 24/7 in exams

BRAUDE = {
    "institution": {"name": "מכללת בראודה", "slug": "braude", "timezone": "Asia/Jerusalem"},
    "buildings": [
        {
            "code": "M",
            "floors_count": 3,
            "places": [
                {"kind": "computer_lab", "name": "M206", "floor": 1, "lab_rows": 5, "lab_cols": 8},
                {"kind": "computer_lab", "name": "M305", "floor": 2, "lab_rows": 5, "lab_cols": 5},
            ],
        },
        {
            "code": "L",
            "floors_count": 1,
            "places": [
                {
                    "kind": "open_area",
                    "name": "מתחם לימוד",
                    "floor": 0,
                    "capacity": 50,
                    "location_note": "ברחבת הבניין, לא מקום ייעודי",
                    "special_periods": [EXAM_PERIOD],
                },
            ],
        },
        {
            "code": "EM",
            "floors_count": 4,
            "places": [
                {"kind": "computer_lab", "name": "EM315", "floor": 2, "lab_rows": 4, "lab_cols": 5},
                {"kind": "computer_lab", "name": "EM212", "floor": 1, "lab_rows": 2, "lab_cols": 5},
                {"kind": "group_room", "name": "EM107", "floor": 0, "capacity": 15},
            ],
        },
        {
            "code": "EF",
            "floors_count": 2,
            "places": [
                {
                    "kind": "open_area",
                    "name": "מתחם לימוד",
                    "floor": 0,
                    "capacity": 50,
                    "location_note": "רחבה ייעודית, ללא מספור",
                    "special_periods": [EXAM_PERIOD],
                },
                {
                    "kind": "library",
                    "name": "ספרייה",
                    "floor": 0,
                    "capacity": 80,
                    "location_note": "EF102",
                },
            ],
        },
        {
            "code": "P",
            "floors_count": 1,
            "hours": WEEK,  # closed on Friday
            "places": [
                {
                    "kind": "open_area",
                    "name": "מתחם 1",
                    "floor": 0,
                    "capacity": 25,
                    "location_note": "ברחבת הבניין",
                },
                {
                    "kind": "open_area",
                    "name": "מתחם 2",
                    "floor": 0,
                    "capacity": 15,
                    "location_note": "ברחבת הבניין",
                },
            ],
        },
        {"code": "NX", "floors_count": 3, "status": "new", "places": []},
        {"code": "NG", "floors_count": 4, "status": "under_construction", "places": []},
    ],
    "default_hours": WEEK_AND_FRIDAY,
    "special_periods": [
        {
            "key": EXAM_PERIOD,
            "name": "תקופת מבחנים (דמו)",
            "starts_on": date(2027, 1, 24),
            "ends_on": date(2027, 2, 19),
        },
    ],
}
