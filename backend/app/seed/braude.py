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

# Microsoft tenant ids of Braude, read on 2026-10-07 from Microsoft's public
# discovery documents (login.microsoftonline.com/<domain>/v2.0/
# .well-known/openid-configuration). A sign-in from any other tenant is not
# Braude, whatever email address it carries.
STUDENTS_TENANT = "49329ec4-6819-4a03-b6ae-bd7be2fcf6ab"  # e.braude.ac.il
STAFF_TENANT = "d4b0e69c-5394-4005-977c-7817ac32ca5e"  # braude.ac.il

# "position" is (latitude, longitude), copied by Itay from Google Maps on
# 2026-10-07 (the middle of each roof), rounded to the 6 decimals the
# column keeps (about 10 cm).

# What each place is like: DEMO VALUES, not collected from the campus.
# They give the site realistic content; every place carries
# details_are_demo, and the site labels these details as demo data.
LAB = {"atmosphere": "quiet", "suited_for": "solo", "amenities": ["computers", "outlets", "ac"]}
OPEN_AREA = {"atmosphere": "conversation", "suited_for": "both", "amenities": ["outlets", "daylight"]}

BRAUDE = {
    "institution": {"name": "מכללת בראודה", "slug": "braude", "timezone": "Asia/Jerusalem"},
    "buildings": [
        {
            "code": "M",
            "position": ("32.912751", "35.282293"),
            "floors_count": 3,
            "places": [
                {
                    "kind": "computer_lab", "name": "M206", "floor": 1, "lab_rows": 5, "lab_cols": 8,
                    "details": {**LAB, "amenities": [*LAB["amenities"], "printer"]},
                },
                {"kind": "computer_lab", "name": "M305", "floor": 2, "lab_rows": 5, "lab_cols": 5, "details": LAB},
            ],
        },
        {
            "code": "L",
            "position": ("32.912396", "35.282790"),
            "floors_count": 1,
            "places": [
                {
                    "kind": "open_area",
                    "name": "מתחם לימוד",
                    "floor": 0,
                    "capacity": 50,
                    "location_note": "ברחבת הבניין, לא מקום ייעודי",
                    "special_periods": [EXAM_PERIOD],
                    "details": OPEN_AREA,
                },
            ],
        },
        {
            "code": "EM",
            "position": ("32.914079", "35.281250"),
            "floors_count": 4,
            "places": [
                {"kind": "computer_lab", "name": "EM315", "floor": 2, "lab_rows": 4, "lab_cols": 5, "details": LAB},
                {"kind": "computer_lab", "name": "EM212", "floor": 1, "lab_rows": 2, "lab_cols": 5, "details": LAB},
                {
                    "kind": "group_room", "name": "EM107", "floor": 0, "capacity": 15,
                    "details": {
                        "atmosphere": "conversation",
                        "suited_for": "group",
                        "amenities": ["whiteboard", "screen", "outlets", "ac"],
                    },
                },
            ],
        },
        {
            "code": "EF",
            "position": ("32.913367", "35.282003"),
            "floors_count": 2,
            "places": [
                {
                    "kind": "open_area",
                    "name": "מתחם לימוד",
                    "floor": 0,
                    "capacity": 50,
                    "location_note": "רחבה ייעודית, ללא מספור",
                    "special_periods": [EXAM_PERIOD],
                    "details": {**OPEN_AREA, "atmosphere": "mixed", "amenities": ["outlets", "daylight", "ac"]},
                },
                {
                    "kind": "library",
                    "name": "ספרייה",
                    "floor": 0,
                    "capacity": 80,
                    "location_note": "EF102",
                    "details": {
                        "atmosphere": "quiet",
                        "suited_for": "solo",
                        "amenities": ["outlets", "ac", "daylight", "printer"],
                    },
                },
            ],
        },
        {
            "code": "P",
            "position": ("32.917067", "35.281550"),
            "floors_count": 1,
            "hours": WEEK,  # closed on Friday
            "places": [
                {
                    "kind": "open_area",
                    "name": "מתחם 1",
                    "floor": 0,
                    "capacity": 25,
                    "location_note": "ברחבת הבניין",
                    "details": OPEN_AREA,
                },
                {
                    "kind": "open_area",
                    "name": "מתחם 2",
                    "floor": 0,
                    "capacity": 15,
                    "location_note": "ברחבת הבניין",
                    "details": {**OPEN_AREA, "amenities": ["daylight"]},
                },
            ],
        },
        {"code": "NX", "floors_count": 3, "status": "new", "position": ("32.914579", "35.280014"), "places": []},
        {"code": "NG", "floors_count": 4, "status": "under_construction", "position": ("32.914383", "35.280751"), "places": []},
    ],
    "login_rules": [
        {"provider": "microsoft", "value": STUDENTS_TENANT},
        {"provider": "microsoft", "value": STAFF_TENANT},
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
