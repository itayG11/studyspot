# Requirements

What I set out to build, what I built, and what I did not. I wrote a first list of requirements on 7 October 2026 (14 items). Some changed on the way, and the table says so. Each row names where to look in the code.

**Status:** *built*, *partly* (part of it works), or *not built* (and why).

## What the system does

| # | Requirement | Status | Where |
|---|---|---|---|
| 1 | Institutions, buildings, places of several kinds (the list began with three; it is four now: computer lab, group room, library, open area), seats, opening hours and special periods | built | `backend/app/models/campus.py`, `backend/app/models/hours.py` |
| 2 | See what is free right now, on a map and a list, and open a place | built | `frontend/src/pages/HomePage.tsx`, `frontend/src/features/space/SpacePage.tsx` |
| 3 | The database refuses two overlapping bookings of the same room, proved by a concurrency test | built | `ex_bookings_room_overlap` in `backend/app/models/bookings.py`, `backend/tests/test_booking_concurrency.py` |
| 4 | Sign in with Google or Microsoft, an email code, or a password; three roles (student, institution admin, system admin) | built | `backend/app/api/auth.py`, `backend/tests/test_access_matrix.py` |
| 5 | A check-in (scanning a signed code on the sign) ends after two hours, or at closing time (a booked check-in lasts as long as its booking) | built | `backend/app/checkins.py` |
| 6 | A booking with no scan within 15 minutes is released | built | `NO_SHOW_AFTER` in `backend/app/bookings.py`, `backend/app/sweeper.py` |
| 7 | A signed code for every place, and a seat map for computer labs | built | `backend/app/codes.py`, `frontend/src/features/space/` |
| 8 | Reminders on the phone (Web Push) and by email | built | `backend/app/reminders.py`, `backend/app/notify.py` |
| 9 | Password with email verification and reset | built | `backend/app/passwords.py` |
| 10 | Expected load for a place, from history, with a chart | built | `backend/app/history.py` (records), `backend/app/forecast.py` (computes) |
| 11 | An institution uploads its campus as a table | built | `frontend/src/admin/BulkImport.tsx`, `backend/app/campus_import.py` |
| 12 | A waiting list for a full group room | built | `backend/app/waitlist.py`. Group rooms only (a lab has many seats: book another). The list never holds the room, so extending a booking is not blocked by it. |
| 13 | Live updates without reloading | not built | Refresh every 30 seconds instead (`REFRESH_INTERVAL_MS` in `frontend/src/config.ts`): simpler, and enough for this data |
| 14 | A Telegram bot for reminders | not built | Replaced by Web Push, which needs no extra account |

## Added after the first list

These came from using the site and from an audit I ran on 12 October.

| What | Where |
|---|---|
| **Between classes** (it grew out of an optional item on the first list): enter a timetable (or upload the college's Excel export or a picture), and get up to three places for each break, with the reason | `backend/app/between_classes.py`, `backend/app/timetable_import.py`, `backend/app/timetable_photo.py` |
| Many institutions on one site, and self-service setup for a new one | `frontend/src/admin/Setup.tsx`, `backend/app/campus_setup.py` |
| Real walking times between buildings | `backend/app/walking.py` |
| A calendar feed, a screen by the door, and an "I'm studying here" link | `backend/app/calendar_feed.py`, `backend/app/screens.py`, `backend/app/shares.py` |
| Connections for an institution: an API, webhooks, and an occupancy widget | `docs/API.md`, `backend/app/webhooks.py`, `frontend/src/embed/` |
| Closing an institution, and proving it owns an email domain through DNS | `backend/app/closing.py`, `backend/app/dns_verify.py` |

## Quality requirements: the target, and what was measured

A target is what I decided in advance. A measurement is what I found. They are different columns on purpose.

| Topic | Target | Measured | Where |
|---|---|---|---|
| Size of the first script | at most 120 kB compressed | 117.5 kB (4 November 2026) | `frontend/scripts/check-bundle-size.mjs` |
| Access control | every route listed and tested | a test that goes over the routes with each role | `backend/tests/test_access_matrix.py` |
| Accessibility | no `axe` findings; buttons at least 24 by 24 px | no serious or critical findings on 25 page visits (guest, student, admin tabs) on three devices; the full check, all impact levels, on the main screens at computer and phone width, light and dark. Keyboard and screen reader checked by hand | `frontend/e2e/sweep.spec.ts`, `frontend/e2e/a11y.spec.ts` |
| Backups | every night, encrypted | a workflow that runs nightly, restores into an empty database and checks the list of tables | `.github/workflows/backup.yml` |
| Privacy | keep as little as possible | a privacy page, and full account deletion | `frontend/src/pages/PrivacyPage.tsx` |
| Capacity | not set in advance | about 80 requests per second on one local machine; not measured on the live free server | [Testing](testing.md) |
| Availability | free hosting | the free server sleeps after 15 idle minutes | [Architecture](architecture.md) |

See also [Decisions and trade-offs](decisions.md) for why I chose what I chose, and [How I worked with AI](process.md).
