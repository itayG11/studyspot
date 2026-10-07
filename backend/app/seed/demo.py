"""The demo campus: what visitors of the live site see and try.

It has the same buildings, places and hours as Braude (app/seed/braude.py),
under its own name, and no real sign-in rules: nobody signs in to it with a
Microsoft or Google account, only with the demo sign-in. So a visitor can
book, scan and act as an admin here without touching Braude, which stays
in the database, ready for real students once the college agrees.
"""

from copy import deepcopy

from app.seed.braude import BRAUDE

DEMO = deepcopy(BRAUDE)
DEMO["institution"] = {"name": "קמפוס הדגמה", "slug": "demo", "timezone": BRAUDE["institution"]["timezone"]}
DEMO["login_rules"] = []
